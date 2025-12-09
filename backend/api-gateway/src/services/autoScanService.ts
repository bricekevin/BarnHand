/**
 * Auto-Scan Service for PTZ Camera Patrol
 *
 * Orchestrates the two-phase auto-scan process:
 * Phase A: Detection Scan - Cycle through presets, take snapshots, detect horses
 * Phase B: Recording Scan - Record at locations with horses detected
 */

import { v4 as uuidv4 } from 'uuid';
import { createClient } from 'redis';
import { Server as SocketServer } from 'socket.io';

import { logger } from '../config/logger';
import { VideoChunkService } from './videoChunkService';

// Types for auto-scan
export interface AutoScanConfig {
  recordingDuration: number; // 5-30 seconds
  frameInterval: number; // 1-30
  movementDelay: number; // 3-15 seconds (HLS delay compensation)
  presetSequence?: number[]; // Which presets to scan
}

export interface PresetScanResult {
  preset: number;
  presetName?: string;
  horsesDetected: boolean;
  horseCount: number;
  detections?: Array<{
    bbox: [number, number, number, number];
    confidence: number;
  }>;
  chunkId?: string;
  scannedAt?: string;
  error?: string;
}

export type AutoScanPhase = 'idle' | 'detection' | 'recording' | 'complete' | 'stopped' | 'error';

export interface AutoScanState {
  scanId: string;
  streamId: string;
  phase: AutoScanPhase;
  currentPreset: number;
  totalPresets: number;
  results: PresetScanResult[];
  locationsWithHorses: number[];
  progress: number;
  currentStep: string;
  startedAt: string;
  completedAt?: string;
  error?: string;
  config: AutoScanConfig;
}

export interface AutoScanResult {
  scanId: string;
  streamId: string;
  totalScanned: number;
  withHorses: number;
  chunksRecorded: number;
  chunkIds: string[];
  durationMs: number;
  status: string;
  presetResults: PresetScanResult[];
  error?: string;
}

// Default configuration
const DEFAULT_CONFIG: AutoScanConfig = {
  recordingDuration: 10,
  frameInterval: 5,
  movementDelay: 8,
};

export class AutoScanService {
  private activeScans: Map<string, AutoScanState> = new Map();
  private videoChunkService: VideoChunkService;
  private redisClient: ReturnType<typeof createClient> | null = null;
  private io: SocketServer | null = null;

  constructor(videoChunkService: VideoChunkService) {
    this.videoChunkService = videoChunkService;
    this.initRedis();
  }

  /**
   * Set the Socket.IO server for emitting events
   */
  setSocketServer(io: SocketServer): void {
    this.io = io;
    logger.info('AutoScanService: Socket.IO server configured');
  }

  private async initRedis(): Promise<void> {
    try {
      const redisUrl = process.env.REDIS_URL || 'redis://redis:6379';
      this.redisClient = createClient({ url: redisUrl });

      this.redisClient.on('error', err => {
        logger.error('AutoScanService Redis error:', err);
      });

      await this.redisClient.connect();
      logger.info('AutoScanService: Redis connected');
    } catch (error) {
      logger.error('AutoScanService: Failed to connect to Redis:', error);
      this.redisClient = null;
    }
  }

  /**
   * Start an auto-scan for a stream
   */
  async startScan(
    streamId: string,
    presets: Array<{ number: number; name?: string }>,
    ptzCredentials: { username: string; password: string },
    cameraHostname: string,
    config: Partial<AutoScanConfig> = {},
    farmId: string,
    userId: string
  ): Promise<AutoScanState> {
    // Check if scan already running for this stream
    if (this.activeScans.has(streamId)) {
      const existing = this.activeScans.get(streamId)!;
      if (existing.phase === 'detection' || existing.phase === 'recording') {
        throw new Error(`Scan already in progress for stream ${streamId}`);
      }
    }

    const scanId = uuidv4();
    const mergedConfig = { ...DEFAULT_CONFIG, ...config };

    // Use preset sequence from config if provided, otherwise use all presets
    const presetSequence = mergedConfig.presetSequence?.length
      ? presets.filter(p => mergedConfig.presetSequence!.includes(p.number))
      : presets;

    if (presetSequence.length === 0) {
      throw new Error('No presets available for scanning');
    }

    const state: AutoScanState = {
      scanId,
      streamId,
      phase: 'detection',
      currentPreset: presetSequence[0].number,
      totalPresets: presetSequence.length,
      results: [],
      locationsWithHorses: [],
      progress: 0,
      currentStep: 'Starting detection scan',
      startedAt: new Date().toISOString(),
      config: mergedConfig,
    };

    this.activeScans.set(streamId, state);
    await this.saveStateToRedis(state);

    // Emit started event
    this.emitEvent('autoScan:started', {
      streamId,
      scanId,
      totalPresets: presetSequence.length,
      phase: 'detection',
      config: mergedConfig,
    });

    logger.info(`Auto-scan started for stream ${streamId}`, {
      scanId,
      presets: presetSequence.map(p => p.number),
      config: mergedConfig,
    });

    // Start the scan process asynchronously
    this.runScan(
      state,
      presetSequence,
      ptzCredentials,
      cameraHostname,
      farmId,
      userId
    ).catch(error => {
      logger.error(`Auto-scan error for stream ${streamId}:`, error);
      this.handleScanError(state, error);
    });

    return state;
  }

  /**
   * Stop an active scan
   */
  async stopScan(streamId: string): Promise<AutoScanState | null> {
    const state = this.activeScans.get(streamId);
    if (!state) {
      return null;
    }

    state.phase = 'stopped';
    state.completedAt = new Date().toISOString();
    state.currentStep = 'Scan stopped by user';

    await this.saveStateToRedis(state);

    this.emitEvent('autoScan:stopped', {
      streamId,
      scanId: state.scanId,
      reason: 'user',
    });

    logger.info(`Auto-scan stopped for stream ${streamId}`, {
      scanId: state.scanId,
      presetsScanned: state.results.length,
    });

    return state;
  }

  /**
   * Get current scan status
   */
  getScanStatus(streamId: string): AutoScanState | null {
    return this.activeScans.get(streamId) || null;
  }

  /**
   * Main scan execution loop
   */
  private async runScan(
    state: AutoScanState,
    presets: Array<{ number: number; name?: string }>,
    ptzCredentials: { username: string; password: string },
    cameraHostname: string,
    farmId: string,
    userId: string
  ): Promise<void> {
    const startTime = Date.now();

    try {
      // Phase A: Detection Scan
      await this.runDetectionPhase(state, presets, ptzCredentials, cameraHostname);

      // Check if stopped
      if (this.isScanStopped(state)) {
        return;
      }

      // Phase B: Recording Scan (only at locations with horses)
      if (state.locationsWithHorses.length > 0) {
        state.phase = 'recording';
        state.currentStep = 'Starting recording scan';
        await this.saveStateToRedis(state);

        this.emitEvent('autoScan:phaseChange', {
          streamId: state.streamId,
          scanId: state.scanId,
          phase: 'recording',
          locationsWithHorses: state.locationsWithHorses,
          totalToRecord: state.locationsWithHorses.length,
        });

        await this.runRecordingPhase(
          state,
          presets,
          ptzCredentials,
          cameraHostname,
          farmId,
          userId
        );
      }

      // Check if stopped during recording
      if (this.isScanStopped(state)) {
        return;
      }

      // Complete the scan
      state.phase = 'complete';
      state.completedAt = new Date().toISOString();
      state.progress = 100;
      state.currentStep = 'Scan complete';
      await this.saveStateToRedis(state);

      const result = this.buildScanResult(state, startTime);
      this.emitEvent('autoScan:complete', {
        streamId: state.streamId,
        scanId: state.scanId,
        results: result,
      });

      logger.info(`Auto-scan completed for stream ${state.streamId}`, {
        scanId: state.scanId,
        totalScanned: result.totalScanned,
        withHorses: result.withHorses,
        chunksRecorded: result.chunksRecorded,
        durationMs: result.durationMs,
      });
    } catch (error) {
      this.handleScanError(state, error);
    }
  }

  /**
   * Phase A: Detection Scan
   */
  private async runDetectionPhase(
    state: AutoScanState,
    presets: Array<{ number: number; name?: string }>,
    ptzCredentials: { username: string; password: string },
    cameraHostname: string
  ): Promise<void> {
    logger.info(`Starting detection phase for ${presets.length} presets`);

    for (let i = 0; i < presets.length; i++) {
      // Check if scan was stopped
      if (this.isScanStopped(state)) {
        return;
      }

      const preset = presets[i];
      state.currentPreset = preset.number;
      state.progress = Math.round((i / presets.length) * 50); // 0-50% for detection
      state.currentStep = `Checking preset ${preset.number}${preset.name ? ` "${preset.name}"` : ''}`;
      await this.saveStateToRedis(state);

      this.emitEvent('autoScan:position', {
        streamId: state.streamId,
        scanId: state.scanId,
        preset: preset.number,
        presetName: preset.name,
        phase: 'detection',
        progress: state.progress,
        currentStep: state.currentStep,
      });

      try {
        // Move PTZ to preset
        await this.movePTZToPreset(cameraHostname, preset.number, ptzCredentials);

        // Wait for camera to settle
        await this.delay(1500);

        // Fetch snapshot
        const snapshotBytes = await this.fetchSnapshot(cameraHostname, ptzCredentials);

        // Detect horses
        const detection = await this.detectHorsesInSnapshot(snapshotBytes);

        const result: PresetScanResult = {
          preset: preset.number,
          presetName: preset.name,
          horsesDetected: detection.horsesDetected,
          horseCount: detection.count,
          detections: detection.detections,
          scannedAt: new Date().toISOString(),
        };

        state.results.push(result);

        if (detection.horsesDetected) {
          state.locationsWithHorses.push(preset.number);
        }

        // Convert snapshot to base64 for frontend display
        const snapshotBase64 = snapshotBytes.toString('base64');

        this.emitEvent('autoScan:detection', {
          streamId: state.streamId,
          scanId: state.scanId,
          preset: preset.number,
          presetName: preset.name,
          horsesDetected: detection.horsesDetected,
          horseCount: detection.count,
          snapshotBase64: `data:image/jpeg;base64,${snapshotBase64}`,
          detections: detection.detections,
        });

        logger.info(`Detection at preset ${preset.number}: ${detection.count} horses`);
      } catch (error) {
        logger.error(`Detection error at preset ${preset.number}:`, error);

        state.results.push({
          preset: preset.number,
          presetName: preset.name,
          horsesDetected: false,
          horseCount: 0,
          scannedAt: new Date().toISOString(),
          error: error instanceof Error ? error.message : 'Detection failed',
        });
      }
    }
  }

  /**
   * Phase B: Recording Scan
   */
  private async runRecordingPhase(
    state: AutoScanState,
    presets: Array<{ number: number; name?: string }>,
    ptzCredentials: { username: string; password: string },
    cameraHostname: string,
    farmId: string,
    userId: string
  ): Promise<void> {
    const locationsToRecord = presets.filter(p =>
      state.locationsWithHorses.includes(p.number)
    );

    logger.info(`Starting recording phase for ${locationsToRecord.length} locations`);

    // Get the stream's source URL for recording
    const StreamRepository = require('@barnhand/database').StreamRepository;
    const streamRepo = new StreamRepository();
    const stream = await streamRepo.findById(state.streamId);

    if (!stream || !stream.source_url) {
      throw new Error('Stream not found or has no source URL');
    }

    for (let i = 0; i < locationsToRecord.length; i++) {
      // Check if scan was stopped
      if (this.isScanStopped(state)) {
        return;
      }

      const preset = locationsToRecord[i];
      const baseProgress = 50 + Math.round((i / locationsToRecord.length) * 50); // 50-100%
      state.currentPreset = preset.number;
      state.progress = baseProgress;
      state.currentStep = `Recording at preset ${preset.number}${preset.name ? ` "${preset.name}"` : ''}`;
      await this.saveStateToRedis(state);

      try {
        // Move PTZ to preset
        await this.movePTZToPreset(cameraHostname, preset.number, ptzCredentials);

        // Wait for HLS delay to catch up
        state.currentStep = `Waiting for stream sync (${state.config.movementDelay}s)`;
        await this.saveStateToRedis(state);
        await this.delay(state.config.movementDelay * 1000);

        this.emitEvent('autoScan:position', {
          streamId: state.streamId,
          scanId: state.scanId,
          preset: preset.number,
          presetName: preset.name,
          phase: 'recording',
          progress: state.progress,
          currentStep: 'Recording...',
        });

        // Record chunk using existing videoChunkService
        const chunk = await this.videoChunkService.recordChunk(
          state.streamId,
          farmId,
          userId,
          stream.source_url,
          state.config.recordingDuration,
          state.config.frameInterval
        );

        // Update result with chunk ID
        const resultIndex = state.results.findIndex(r => r.preset === preset.number);
        if (resultIndex >= 0) {
          state.results[resultIndex].chunkId = chunk.id;
        }

        this.emitEvent('autoScan:recording', {
          streamId: state.streamId,
          scanId: state.scanId,
          preset: preset.number,
          presetName: preset.name,
          chunkId: chunk.id,
          progress: state.progress,
        });

        logger.info(`Recorded chunk ${chunk.id} at preset ${preset.number}`);
      } catch (error) {
        logger.error(`Recording error at preset ${preset.number}:`, error);

        // Update result with error
        const resultIndex = state.results.findIndex(r => r.preset === preset.number);
        if (resultIndex >= 0) {
          state.results[resultIndex].error =
            error instanceof Error ? error.message : 'Recording failed';
        }
      }
    }
  }

  /**
   * Move PTZ camera to a preset position
   */
  private async movePTZToPreset(
    hostname: string,
    presetNumber: number,
    credentials: { username: string; password: string }
  ): Promise<void> {
    const url = `http://${hostname}:8080/web/cgi-bin/hi3510/param.cgi?cmd=preset&-act=goto&-status=1&-number=${presetNumber}&-usr=${encodeURIComponent(credentials.username)}&-pwd=${encodeURIComponent(credentials.password)}`;

    const response = await fetch(url, { method: 'GET' });

    if (!response.ok) {
      throw new Error(`PTZ command failed: ${response.status}`);
    }
  }

  /**
   * Fetch snapshot from camera
   */
  private async fetchSnapshot(
    hostname: string,
    credentials: { username: string; password: string }
  ): Promise<Buffer> {
    const url = `http://${hostname}:8080/web/tmpfs/auto.jpg?usr=${encodeURIComponent(credentials.username)}&pwd=${encodeURIComponent(credentials.password)}&t=${Date.now()}`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Snapshot fetch failed: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Send snapshot to ML service for horse detection
   */
  private async detectHorsesInSnapshot(imageBytes: Buffer): Promise<{
    horsesDetected: boolean;
    count: number;
    detections: Array<{
      bbox: [number, number, number, number];
      confidence: number;
    }>;
  }> {
    const mlServiceUrl = process.env.ML_SERVICE_URL || 'http://ml-service:8002';

    // Create form data with the image
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(imageBytes)], { type: 'image/jpeg' });
    formData.append('image', blob, 'snapshot.jpg');
    formData.append('confidence_threshold', '0.3');

    const response = await fetch(`${mlServiceUrl}/detect-snapshot`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ML detection failed: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    return {
      horsesDetected: result.horses_detected,
      count: result.count,
      detections: result.detections.map((d: { bbox: number[]; confidence: number }) => ({
        bbox: d.bbox as [number, number, number, number],
        confidence: d.confidence,
      })),
    };
  }

  /**
   * Handle scan errors
   */
  private handleScanError(state: AutoScanState, error: unknown): void {
    state.phase = 'error';
    state.completedAt = new Date().toISOString();
    state.error = error instanceof Error ? error.message : 'Unknown error';
    state.currentStep = 'Scan failed';

    this.saveStateToRedis(state).catch(e =>
      logger.error('Failed to save error state:', e)
    );

    this.emitEvent('autoScan:error', {
      streamId: state.streamId,
      scanId: state.scanId,
      error: state.error,
      recoverable: false,
    });

    logger.error(`Auto-scan failed for stream ${state.streamId}`, {
      scanId: state.scanId,
      error: state.error,
    });
  }

  /**
   * Build final scan result
   */
  private buildScanResult(state: AutoScanState, startTime: number): AutoScanResult {
    const chunksRecorded = state.results.filter(r => r.chunkId).length;
    const chunkIds = state.results
      .filter(r => r.chunkId)
      .map(r => r.chunkId as string);

    return {
      scanId: state.scanId,
      streamId: state.streamId,
      totalScanned: state.results.length,
      withHorses: state.locationsWithHorses.length,
      chunksRecorded,
      chunkIds,
      durationMs: Date.now() - startTime,
      status: state.phase,
      presetResults: state.results,
    };
  }

  /**
   * Save state to Redis
   */
  private async saveStateToRedis(state: AutoScanState): Promise<void> {
    if (!this.redisClient) return;

    try {
      await this.redisClient.setEx(
        `autoscan:${state.streamId}:state`,
        3600, // 1 hour TTL
        JSON.stringify(state)
      );
    } catch (error) {
      logger.error('Failed to save auto-scan state to Redis:', error);
    }
  }

  /**
   * Emit WebSocket event
   */
  private emitEvent(event: string, data: Record<string, unknown>): void {
    if (!this.io) {
      logger.debug(`No Socket.IO server configured, skipping event: ${event}`);
      return;
    }

    const streamId = data.streamId as string;
    if (streamId) {
      this.io.to(`stream:${streamId}`).emit(event, data);
    }
  }

  /**
   * Helper: delay execution
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Helper: check if scan was stopped or errored
   */
  private isScanStopped(state: AutoScanState): boolean {
    return state.phase === 'stopped' || state.phase === 'error';
  }
}

// Singleton instance
let autoScanServiceInstance: AutoScanService | null = null;

export function getAutoScanService(videoChunkService: VideoChunkService): AutoScanService {
  if (!autoScanServiceInstance) {
    autoScanServiceInstance = new AutoScanService(videoChunkService);
  }
  return autoScanServiceInstance;
}
