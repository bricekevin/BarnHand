import { useEffect, useState, useCallback, useRef } from 'react';

import { websocketService } from '../services/websocket';
import type { Detection, ChunkProcessedData, MetricsUpdate } from '../services/websocket';

interface UseWebSocketOptions {
  autoConnect?: boolean;
  streamIds?: string[];
  onDetection?: (data: { streamId: string; detection: Detection }) => void;
  onChunkProcessed?: (data: ChunkProcessedData) => void;
  onMetricsUpdate?: (data: MetricsUpdate) => void;
  onStreamStatus?: (data: { streamId: string; status: string }) => void;
  onHorseUpdate?: (data: any) => void;
  onError?: (error: any) => void;
}

interface UseWebSocketReturn {
  isConnected: boolean;
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
  connect: () => Promise<void>;
  disconnect: () => void;
  subscribeToStream: (streamId: string) => void;
  unsubscribeFromStream: (streamId: string) => void;
  subscribedStreams: string[];
}

export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const {
    autoConnect = true,
    streamIds = [],
    onDetection,
    onChunkProcessed,
    onMetricsUpdate,
    onStreamStatus,
    onHorseUpdate,
    onError,
  } = options;

  const [isConnected, setIsConnected] = useState(websocketService.isConnected());
  const [connectionStatus, setConnectionStatus] = useState<UseWebSocketReturn['connectionStatus']>(
    websocketService.getConnectionStatus()
  );
  const [subscribedStreams, setSubscribedStreams] = useState<string[]>(
    websocketService.getSubscribedStreams()
  );

  const handlersRef = useRef({
    onDetection,
    onChunkProcessed,
    onMetricsUpdate,
    onStreamStatus,
    onHorseUpdate,
    onError,
  });

  // Update handlers ref when they change
  useEffect(() => {
    handlersRef.current = {
      onDetection,
      onChunkProcessed,
      onMetricsUpdate,
      onStreamStatus,
      onHorseUpdate,
      onError,
    };
  }, [onDetection, onChunkProcessed, onMetricsUpdate, onStreamStatus, onHorseUpdate, onError]);

  const connect = useCallback(async () => {
    try {
      await websocketService.connect();
    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
      handlersRef.current.onError?.(error);
    }
  }, []);

  const disconnect = useCallback(() => {
    websocketService.disconnect();
  }, []);

  const subscribeToStream = useCallback((streamId: string) => {
    websocketService.subscribeToStream(streamId);
    setSubscribedStreams(websocketService.getSubscribedStreams());
  }, []);

  const unsubscribeFromStream = useCallback((streamId: string) => {
    websocketService.unsubscribeFromStream(streamId);
    setSubscribedStreams(websocketService.getSubscribedStreams());
  }, []);

  useEffect(() => {
    // Event handlers
    const handleConnectionStatus = (status: typeof connectionStatus) => {
      setConnectionStatus(status);
      setIsConnected(status === 'connected');
    };

    const handleDetectionUpdate = (data: any) => {
      handlersRef.current.onDetection?.(data);
    };

    const handleChunkProcessed = (data: ChunkProcessedData) => {
      handlersRef.current.onChunkProcessed?.(data);
    };

    const handleMetricsUpdate = (data: MetricsUpdate) => {
      handlersRef.current.onMetricsUpdate?.(data);
    };

    const handleStreamStatus = (data: any) => {
      handlersRef.current.onStreamStatus?.(data);
    };

    const handleHorseUpdate = (data: any) => {
      handlersRef.current.onHorseUpdate?.(data);
    };

    const handleError = (error: any) => {
      handlersRef.current.onError?.(error);
    };

    const handleSubscribed = () => {
      setSubscribedStreams(websocketService.getSubscribedStreams());
    };

    const handleUnsubscribed = () => {
      setSubscribedStreams(websocketService.getSubscribedStreams());
    };

    // Register event listeners
    websocketService.on('connection:status', handleConnectionStatus);
    websocketService.on('detection:update', handleDetectionUpdate);
    websocketService.on('chunk:processed', handleChunkProcessed);
    websocketService.on('metrics:update', handleMetricsUpdate);
    websocketService.on('stream:status', handleStreamStatus);
    websocketService.on('horse:update', handleHorseUpdate);
    websocketService.on('error', handleError);
    websocketService.on('subscribed:stream', handleSubscribed);
    websocketService.on('unsubscribed:stream', handleUnsubscribed);

    // Auto-connect if requested
    if (autoConnect && !isConnected) {
      connect();
    }

    // Subscribe to initial streams
    if (isConnected && streamIds.length > 0) {
      streamIds.forEach(streamId => {
        websocketService.subscribeToStream(streamId);
      });
    }

    // Cleanup
    return () => {
      websocketService.off('connection:status', handleConnectionStatus);
      websocketService.off('detection:update', handleDetectionUpdate);
      websocketService.off('chunk:processed', handleChunkProcessed);
      websocketService.off('metrics:update', handleMetricsUpdate);
      websocketService.off('stream:status', handleStreamStatus);
      websocketService.off('horse:update', handleHorseUpdate);
      websocketService.off('error', handleError);
      websocketService.off('subscribed:stream', handleSubscribed);
      websocketService.off('unsubscribed:stream', handleUnsubscribed);
    };
  }, [autoConnect, isConnected, connect, streamIds]);

  return {
    isConnected,
    connectionStatus,
    connect,
    disconnect,
    subscribeToStream,
    unsubscribeFromStream,
    subscribedStreams,
  };
}

export default useWebSocket;