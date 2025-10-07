import { WebSocketServer } from './socketServer';

// Type definitions for WebSocket events
export interface DetectionData {
  id: string;
  horseId: string;
  confidence: number;
  bbox: { x: number; y: number; width: number; height: number };
  timestamp: Date;
  [key: string]: unknown;
}

export interface ChunkData {
  id: string;
  streamId: string;
  status: string;
  processedUrl?: string;
  [key: string]: unknown;
}

export interface MetricsData {
  timestamp: Date;
  streams: number;
  detections: number;
  [key: string]: unknown;
}

export interface HorseData {
  id: string;
  name?: string;
  lastSeen: Date;
  [key: string]: unknown;
}


// Extend global interface for WebSocket server
declare global {
  // eslint-disable-next-line no-var
  var wsServer: WebSocketServer | undefined;
}

// Get WebSocket server instance
export function getWSServer(): WebSocketServer | null {
  return globalThis.wsServer || null;
}

// Helper functions for emitting events

export function emitDetectionUpdate(
  streamId: string,
  detection: DetectionData
) {
  const wsServer = getWSServer();
  if (wsServer) {
    wsServer.emitDetectionUpdate(streamId, detection);
  }
}

export function emitChunkProcessed(streamId: string, chunkData: ChunkData) {
  const wsServer = getWSServer();
  if (wsServer) {
    wsServer.emitChunkProcessed(streamId, chunkData);
  }
}

export function emitMetricsUpdate(farmId: string, metrics: MetricsData) {
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

export function emitHorseUpdate(farmId: string, horseData: HorseData) {
  const wsServer = getWSServer();
  if (wsServer) {
    wsServer.emitHorseUpdate(farmId, horseData);
  }
}

export function broadcastToFarm(farmId: string, event: string, data: unknown) {
  const wsServer = getWSServer();
  if (wsServer) {
    wsServer.broadcastToFarm(farmId, event, data);
  }
}

