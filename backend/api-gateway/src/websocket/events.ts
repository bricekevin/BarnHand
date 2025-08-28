import { WebSocketServer } from './socketServer';

// Get WebSocket server instance
export function getWSServer(): WebSocketServer | null {
  return (global as any).wsServer || null;
}

// Helper functions for emitting events

export function emitDetectionUpdate(streamId: string, detection: any) {
  const wsServer = getWSServer();
  if (wsServer) {
    wsServer.emitDetectionUpdate(streamId, detection);
  }
}

export function emitChunkProcessed(streamId: string, chunkData: any) {
  const wsServer = getWSServer();
  if (wsServer) {
    wsServer.emitChunkProcessed(streamId, chunkData);
  }
}

export function emitMetricsUpdate(farmId: string, metrics: any) {
  const wsServer = getWSServer();
  if (wsServer) {
    wsServer.emitMetricsUpdate(farmId, metrics);
  }
}

export function emitStreamStatusChange(streamId: string, status: string) {
  const wsServer = getWSServer();
  if (wsServer) {
    wsServer.emitStreamStatusChange(streamId, status);
  }
}

export function emitHorseUpdate(farmId: string, horseData: any) {
  const wsServer = getWSServer();
  if (wsServer) {
    wsServer.emitHorseUpdate(farmId, horseData);
  }
}

export function broadcastToFarm(farmId: string, event: string, data: any) {
  const wsServer = getWSServer();
  if (wsServer) {
    wsServer.broadcastToFarm(farmId, event, data);
  }
}