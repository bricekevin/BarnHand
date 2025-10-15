import { io, Socket } from 'socket.io-client';
import { useAppStore } from '../stores/useAppStore';
import type { Horse } from '../../../shared/src/types/horse.types';

// WebSocket event types
interface HorsesDetectedEvent {
  streamId: string;
  horses: Array<{
    id: string;
    tracking_id: string;
    assigned_color: string;
    confidence_score: number;
    first_detected?: string;
    last_seen: string;
    total_detections: number;
    thumbnail_url?: string;
    name?: string;
    breed?: string;
    age?: number;
    color?: string;
    markings?: string;
    status?: string;
    avatar_thumbnail?: string;
    metadata?: Record<string, unknown>;
    created_at?: string;
    updated_at?: string;
    farm_id?: string;
    stream_id?: string;
    feature_vector?: number[];
  }>;
  timestamp: string;
}

interface HorseUpdatedEvent {
  streamId: string;
  horse: {
    id: string;
    tracking_id: string;
    name?: string;
    breed?: string;
    age?: number;
    color?: string;
    markings?: string;
    assigned_color: string;
    last_seen: string;
    total_detections: number;
    thumbnail_url?: string;
    confidence_score?: number;
    status?: string;
    avatar_thumbnail?: string;
    metadata?: Record<string, unknown>;
    created_at?: string;
    updated_at?: string;
    farm_id?: string;
    stream_id?: string;
    first_detected?: string;
    feature_vector?: number[];
  };
  timestamp: string;
}

// WebSocket service class
class WebSocketService {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private subscribedStreams = new Set<string>();
  private lastUpdate: Record<string, number> = {}; // Track last update time per stream
  private debounceDelay = 300; // 300ms debounce

  connect(apiUrl: string = 'http://localhost:8000', authToken?: string): void {
    if (this.socket?.connected) {
      console.log('[WebSocket] Already connected');
      return;
    }

    console.log('[WebSocket] Connecting to', apiUrl);

    this.socket = io(apiUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: this.reconnectDelay,
      auth: authToken ? { token: authToken } : undefined,
    });

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('[WebSocket] Connected, socket ID:', this.socket?.id);
      this.reconnectAttempts = 0;

      // Re-subscribe to streams after reconnect
      this.subscribedStreams.forEach(streamId => {
        this.subscribeToStream(streamId);
      });
    });

    this.socket.on('disconnect', (reason: string) => {
      console.log('[WebSocket] Disconnected:', reason);
    });

    this.socket.on('connect_error', (error: Error) => {
      console.error('[WebSocket] Connection error:', error);
      this.reconnectAttempts++;

      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error('[WebSocket] Max reconnection attempts reached');
      }
    });

    // Horse registry events
    this.socket.on('horses:detected', (event: HorsesDetectedEvent) => {
      console.log('[WebSocket] horses:detected event received:', event);
      this.handleHorsesDetected(event);
    });

    this.socket.on('horses:updated', (event: HorseUpdatedEvent) => {
      console.log('[WebSocket] horses:updated event received:', event);
      this.handleHorseUpdated(event);
    });

    // Other events (for future use)
    this.socket.on('chunk:processed', (data: unknown) => {
      console.log('[WebSocket] chunk:processed event:', data);
    });

    this.socket.on('detection:update', (data: unknown) => {
      console.log('[WebSocket] detection:update event:', data);
    });
  }

  private handleHorsesDetected(event: HorsesDetectedEvent): void {
    const { streamId, horses } = event;

    // Debounce updates per stream
    const now = Date.now();
    const lastUpdateTime = this.lastUpdate[streamId] || 0;

    if (now - lastUpdateTime < this.debounceDelay) {
      console.log('[WebSocket] Debouncing horses:detected for stream', streamId);
      return;
    }

    this.lastUpdate[streamId] = now;

    // Convert horses to full Horse type
    const fullHorses: Horse[] = horses.map(h => ({
      id: h.id,
      tracking_id: h.tracking_id,
      assigned_color: h.assigned_color,
      confidence_score: h.confidence_score || 0,
      first_detected: h.first_detected || h.last_seen,
      last_seen: h.last_seen,
      total_detections: h.total_detections,
      status: (h.status as 'unidentified' | 'identified' | 'confirmed' | 'disputed') || 'unidentified',
      created_at: h.created_at || new Date().toISOString(),
      updated_at: h.updated_at || new Date().toISOString(),
      ...(h.name && { name: h.name }),
      ...(h.breed && { breed: h.breed }),
      ...(h.age !== undefined && { age: h.age }),
      ...(h.color && { color: h.color }),
      ...(h.markings && { markings: h.markings }),
      ...(h.thumbnail_url && { thumbnail_url: h.thumbnail_url }),
      ...(h.avatar_thumbnail && { avatar_thumbnail: h.avatar_thumbnail }),
      ...(h.farm_id && { farm_id: h.farm_id }),
      ...(h.stream_id && { stream_id: h.stream_id }),
      ...(h.feature_vector && { feature_vector: h.feature_vector }),
      ...(h.metadata && { metadata: h.metadata }),
    }));

    // Update store with new/updated horses
    const store = useAppStore.getState();
    fullHorses.forEach(horse => {
      store.addStreamHorse(streamId, horse);
    });

    console.log(`[WebSocket] Updated ${fullHorses.length} horses for stream ${streamId}`);
  }

  private handleHorseUpdated(event: HorseUpdatedEvent): void {
    const { streamId, horse } = event;

    // Convert to full Horse type
    const fullHorse: Horse = {
      id: horse.id,
      tracking_id: horse.tracking_id,
      assigned_color: horse.assigned_color,
      confidence_score: horse.confidence_score || 0,
      first_detected: horse.first_detected || horse.last_seen,
      last_seen: horse.last_seen,
      total_detections: horse.total_detections,
      status: (horse.status as 'unidentified' | 'identified' | 'confirmed' | 'disputed') || 'unidentified',
      created_at: horse.created_at || new Date().toISOString(),
      updated_at: horse.updated_at || new Date().toISOString(),
      ...(horse.name && { name: horse.name }),
      ...(horse.breed && { breed: horse.breed }),
      ...(horse.age !== undefined && { age: horse.age }),
      ...(horse.color && { color: horse.color }),
      ...(horse.markings && { markings: horse.markings }),
      ...(horse.thumbnail_url && { thumbnail_url: horse.thumbnail_url }),
      ...(horse.avatar_thumbnail && { avatar_thumbnail: horse.avatar_thumbnail }),
      ...(horse.farm_id && { farm_id: horse.farm_id }),
      ...(horse.stream_id && { stream_id: horse.stream_id }),
      ...(horse.feature_vector && { feature_vector: horse.feature_vector }),
      ...(horse.metadata && { metadata: horse.metadata }),
    };

    // Update store with updated horse
    const store = useAppStore.getState();
    store.updateStreamHorse(streamId, horse.id, fullHorse);

    console.log(`[WebSocket] Updated horse ${horse.id} for stream ${streamId}`);
  }

  subscribeToStream(streamId: string): void {
    if (!this.socket?.connected) {
      console.warn('[WebSocket] Not connected, cannot subscribe to stream', streamId);
      return;
    }

    console.log('[WebSocket] Subscribing to stream', streamId);
    this.socket.emit('subscribe:stream', { streamId });
    this.subscribedStreams.add(streamId);
  }

  unsubscribeFromStream(streamId: string): void {
    if (!this.socket?.connected) {
      console.warn('[WebSocket] Not connected, cannot unsubscribe from stream', streamId);
      return;
    }

    console.log('[WebSocket] Unsubscribing from stream', streamId);
    this.socket.emit('unsubscribe:stream', { streamId });
    this.subscribedStreams.delete(streamId);
  }

  disconnect(): void {
    if (this.socket) {
      console.log('[WebSocket] Disconnecting');
      this.subscribedStreams.clear();
      this.socket.disconnect();
      this.socket = null;
    }
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  getSubscribedStreams(): string[] {
    return Array.from(this.subscribedStreams);
  }
}

// Export singleton instance
export const websocketService = new WebSocketService();
