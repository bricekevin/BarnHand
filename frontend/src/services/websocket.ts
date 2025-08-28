import { io, Socket } from 'socket.io-client';

import { useAppStore } from '../stores/useAppStore';

interface ConnectionOptions {
  token?: string;
  reconnection?: boolean;
  reconnectionDelay?: number;
  reconnectionAttempts?: number;
}

export interface Detection {
  id: string;
  horseId: string;
  streamId: string;
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  pose?: {
    keypoints: Array<{
      x: number;
      y: number;
      confidence: number;
    }>;
  };
  confidence: number;
  timestamp: Date;
  trackingId: string;
}

export interface ChunkProcessedData {
  streamId: string;
  chunkId: string;
  processedUrl: string;
  detectionCount: number;
  processingTime: number;
  timestamp: string;
}

export interface MetricsUpdate {
  horsesTracked: number;
  detectionAccuracy: number;
  processingDelay: number;
  systemHealth: 'excellent' | 'good' | 'warning' | 'critical';
  timestamp: string;
}

class WebSocketService {
  private socket: Socket | null = null;
  private connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error' = 'disconnected';
  private reconnectTimer?: NodeJS.Timeout;
  private subscribedStreams: Set<string> = new Set();
  private eventHandlers: Map<string, Set<Function>> = new Map();
  private connectionAttempts = 0;
  private maxReconnectAttempts = 10;
  private baseReconnectDelay = 1000;
  private pingInterval?: NodeJS.Timeout;

  constructor() {
    // Set up online/offline listeners
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());
  }

  // Connect to WebSocket server
  public connect(options: ConnectionOptions = {}): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket?.connected) {
        resolve();
        return;
      }

      const wsUrl = import.meta.env.VITE_WS_URL || 'http://localhost:8000';
      
      this.updateConnectionStatus('connecting');
      this.connectionAttempts++;

      this.socket = io(wsUrl, {
        auth: {
          token: options.token || localStorage.getItem('authToken'),
        },
        reconnection: options.reconnection !== false,
        reconnectionDelay: options.reconnectionDelay || this.baseReconnectDelay,
        reconnectionAttempts: options.reconnectionAttempts || this.maxReconnectAttempts,
        transports: ['websocket', 'polling'],
      });

      // Connection event handlers
      this.socket.on('connect', () => {
        console.log('WebSocket connected:', this.socket?.id);
        this.updateConnectionStatus('connected');
        this.connectionAttempts = 0;
        
        // Resubscribe to streams after reconnection
        this.resubscribeToStreams();
        
        // Start ping interval
        this.startPingInterval();
        
        resolve();
      });

      this.socket.on('disconnect', (reason) => {
        console.log('WebSocket disconnected:', reason);
        this.updateConnectionStatus('disconnected');
        this.stopPingInterval();
        
        // Handle reconnection
        if (reason === 'io server disconnect') {
          // Server disconnected us, try to reconnect
          this.attemptReconnect();
        }
      });

      this.socket.on('connect_error', (error) => {
        console.error('WebSocket connection error:', error.message);
        this.updateConnectionStatus('error');
        
        if (this.connectionAttempts === 1) {
          reject(error);
        }
      });

      // Set up message handlers
      this.setupMessageHandlers();
      
      // Set up error handling
      this.socket.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.emit('error', error);
      });

      // Handle server shutdown
      this.socket.on('server:shutdown', (data) => {
        console.warn('Server is shutting down:', data);
        this.updateConnectionStatus('disconnected');
        this.emit('server:shutdown', data);
      });
    });
  }

  // Disconnect from WebSocket server
  public disconnect(): void {
    this.stopPingInterval();
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    
    this.subscribedStreams.clear();
    this.updateConnectionStatus('disconnected');
  }

  // Subscribe to a stream
  public subscribeToStream(streamId: string): void {
    if (!this.socket?.connected) {
      console.warn('Cannot subscribe: WebSocket not connected');
      return;
    }

    if (this.subscribedStreams.has(streamId)) {
      console.log('Already subscribed to stream:', streamId);
      return;
    }

    this.socket.emit('subscribe:stream', streamId);
    this.subscribedStreams.add(streamId);
    console.log('Subscribed to stream:', streamId);
  }

  // Unsubscribe from a stream
  public unsubscribeFromStream(streamId: string): void {
    if (!this.socket?.connected) {
      console.warn('Cannot unsubscribe: WebSocket not connected');
      return;
    }

    if (!this.subscribedStreams.has(streamId)) {
      console.log('Not subscribed to stream:', streamId);
      return;
    }

    this.socket.emit('unsubscribe:stream', streamId);
    this.subscribedStreams.delete(streamId);
    console.log('Unsubscribed from stream:', streamId);
  }

  // Add event listener
  public on(event: string, handler: Function): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)?.add(handler);
  }

  // Remove event listener
  public off(event: string, handler: Function): void {
    this.eventHandlers.get(event)?.delete(handler);
  }

  // Emit event to local handlers
  private emit(event: string, data: any): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => handler(data));
    }
  }

  // Set up message handlers
  private setupMessageHandlers(): void {
    if (!this.socket) return;

    // Detection update handler
    this.socket.on('detection:update', (data) => {
      console.log('Detection update received:', data);
      
      // Update store with new detection
      const store = useAppStore.getState();
      const detection: Detection = {
        ...data.detection,
        timestamp: new Date(data.timestamp),
      };
      store.addDetections([detection]);
      
      this.emit('detection:update', data);
    });

    // Chunk processed handler
    this.socket.on('chunk:processed', (data: ChunkProcessedData) => {
      console.log('Chunk processed:', data);
      
      // Update stream with processed URL
      const store = useAppStore.getState();
      store.updateStream(data.streamId, {
        processedUrl: data.processedUrl,
        lastUpdate: data.timestamp,
      });
      
      this.emit('chunk:processed', data);
    });

    // Metrics update handler
    this.socket.on('metrics:update', (data: MetricsUpdate) => {
      console.log('Metrics update:', data);
      
      // Update metrics in store
      // You might want to add a metrics section to your store
      
      this.emit('metrics:update', data);
    });

    // Stream status handler
    this.socket.on('stream:status', (data) => {
      console.log('Stream status update:', data);
      
      // Update stream status in store
      const store = useAppStore.getState();
      store.updateStream(data.streamId, {
        status: data.status,
      });
      
      this.emit('stream:status', data);
    });

    // Horse update handler
    this.socket.on('horse:update', (data) => {
      console.log('Horse update:', data);
      
      // Update horse in store
      const store = useAppStore.getState();
      if (data.horseId && data.updates) {
        store.updateHorse(data.horseId, data.updates);
      }
      
      this.emit('horse:update', data);
    });

    // Connection confirmation
    this.socket.on('connected', (data) => {
      console.log('Connection confirmed:', data);
      this.emit('connected', data);
    });

    // Subscription confirmation
    this.socket.on('subscribed:stream', (data) => {
      console.log('Subscription confirmed:', data);
      this.emit('subscribed:stream', data);
    });

    // Unsubscription confirmation
    this.socket.on('unsubscribed:stream', (data) => {
      console.log('Unsubscription confirmed:', data);
      this.emit('unsubscribed:stream', data);
    });

    // Pong response
    this.socket.on('pong', (data) => {
      console.debug('Pong received:', data);
    });
  }

  // Update connection status and notify store
  private updateConnectionStatus(status: typeof this.connectionStatus): void {
    this.connectionStatus = status;
    
    // Update UI to show connection status
    const store = useAppStore.getState();
    // You might want to add a connectionStatus field to your store
    (store as any).setWebSocketStatus?.(status);
    
    this.emit('connection:status', status);
  }

  // Attempt to reconnect
  private attemptReconnect(): void {
    if (this.connectionAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      this.updateConnectionStatus('error');
      return;
    }

    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(2, this.connectionAttempts),
      30000 // Max 30 seconds
    );

    console.log(`Attempting reconnection in ${delay}ms (attempt ${this.connectionAttempts + 1})`);
    
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  // Resubscribe to streams after reconnection
  private resubscribeToStreams(): void {
    if (this.subscribedStreams.size > 0) {
      console.log('Resubscribing to streams:', Array.from(this.subscribedStreams));
      this.subscribedStreams.forEach(streamId => {
        this.socket?.emit('subscribe:stream', streamId);
      });
    }
  }

  // Start ping interval to keep connection alive
  private startPingInterval(): void {
    this.stopPingInterval();
    
    this.pingInterval = setInterval(() => {
      if (this.socket?.connected) {
        this.socket.emit('ping');
      }
    }, 30000); // Ping every 30 seconds
  }

  // Stop ping interval
  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = undefined;
    }
  }

  // Handle online event
  private handleOnline(): void {
    console.log('Network online, attempting reconnection...');
    if (this.connectionStatus === 'disconnected' || this.connectionStatus === 'error') {
      this.connect();
    }
  }

  // Handle offline event
  private handleOffline(): void {
    console.log('Network offline');
    this.updateConnectionStatus('disconnected');
  }

  // Get connection status
  public getConnectionStatus(): typeof this.connectionStatus {
    return this.connectionStatus;
  }

  // Check if connected
  public isConnected(): boolean {
    return this.socket?.connected || false;
  }

  // Get subscribed streams
  public getSubscribedStreams(): string[] {
    return Array.from(this.subscribedStreams);
  }
}

// Create singleton instance
export const websocketService = new WebSocketService();

export default WebSocketService;