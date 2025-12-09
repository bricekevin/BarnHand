import { z } from 'zod';

/**
 * Phase 5: PTZ Auto-Scan Types
 *
 * These types support the PTZ auto-scan feature that cycles through camera
 * presets to detect horse presence (using YOLO snapshots) and then records
 * full ML processing only at locations with horses.
 */

// ===== Enums =====

/**
 * Current phase of the auto-scan process
 * - idle: No scan in progress
 * - detection: Phase A - cycling through presets with snapshot detection
 * - recording: Phase B - recording at locations with horses
 * - complete: Scan finished successfully
 * - stopped: User stopped the scan
 * - error: Scan failed due to error
 */
export const AutoScanPhaseSchema = z.enum([
  'idle',
  'detection',
  'recording',
  'complete',
  'stopped',
  'error',
]);

// ===== Configuration Types =====

/**
 * PTZ camera credentials (stored in stream config)
 * Refactored from localStorage for server-side access
 */
export const PTZCredentialsSchema = z.object({
  username: z.string().min(1).max(100),
  password: z.string().min(1).max(100),
});

/**
 * A saved PTZ preset location
 */
export const PTZPresetSchema = z.object({
  name: z.string().max(100),
  savedAt: z.string().datetime(),
});

/**
 * Collection of saved PTZ presets (keyed by preset number)
 */
export const PTZPresetsSchema = z.record(z.string(), PTZPresetSchema);

/**
 * Auto-scan configuration settings (stored in stream config)
 */
export const AutoScanConfigSchema = z.object({
  /** Recording duration per location (5-30 seconds) */
  recordingDuration: z.number().int().min(5).max(30).default(10),
  /** Frame interval for ML processing (1-30, process every Nth frame) */
  frameInterval: z.number().int().min(1).max(30).default(5),
  /** Delay after PTZ move before recording, to account for HLS lag (3-15 seconds) */
  movementDelay: z.number().int().min(3).max(15).default(8),
  /** Optional: which presets to scan (defaults to all saved presets) */
  presetSequence: z.array(z.number().int().min(0).max(9)).optional(),
});

// ===== Scan State Types =====

/**
 * Result of snapshot detection at a single preset location
 */
export const PresetScanResultSchema = z.object({
  /** Preset number (0-9) */
  preset: z.number().int().min(0).max(9),
  /** Preset name (if available) */
  presetName: z.string().optional(),
  /** Whether horses were detected at this location */
  horsesDetected: z.boolean(),
  /** Number of horses detected (from YOLO) */
  horseCount: z.number().int().min(0),
  /** Detection confidence scores */
  detections: z
    .array(
      z.object({
        bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
        confidence: z.number().min(0).max(1),
      })
    )
    .optional(),
  /** If recording was triggered, the chunk ID */
  chunkId: z.string().uuid().optional(),
  /** Time when this preset was scanned */
  scannedAt: z.string().datetime().optional(),
  /** Error message if detection failed at this preset */
  error: z.string().optional(),
});

/**
 * Runtime state of an active auto-scan
 */
export const AutoScanStateSchema = z.object({
  /** Unique scan ID */
  scanId: z.string().uuid(),
  /** Stream being scanned */
  streamId: z.string().uuid(),
  /** Current phase of the scan */
  phase: AutoScanPhaseSchema,
  /** Current preset being processed */
  currentPreset: z.number().int().min(0).max(9),
  /** Total presets to scan */
  totalPresets: z.number().int().min(1).max(10),
  /** Results from each preset */
  results: z.array(PresetScanResultSchema),
  /** Presets that have horses (for Phase B) */
  locationsWithHorses: z.array(z.number().int()),
  /** Progress percentage (0-100) */
  progress: z.number().min(0).max(100),
  /** Current step description */
  currentStep: z.string(),
  /** Scan start time */
  startedAt: z.string().datetime(),
  /** Scan completion time */
  completedAt: z.string().datetime().optional(),
  /** Error message if scan failed */
  error: z.string().optional(),
  /** Configuration used for this scan */
  config: AutoScanConfigSchema,
});

/**
 * Summary of completed auto-scan
 */
export const AutoScanResultSchema = z.object({
  /** Unique scan ID */
  scanId: z.string().uuid(),
  /** Stream that was scanned */
  streamId: z.string().uuid(),
  /** Total presets scanned */
  totalScanned: z.number().int().min(0),
  /** Presets with horses detected */
  withHorses: z.number().int().min(0),
  /** Number of chunks recorded */
  chunksRecorded: z.number().int().min(0),
  /** List of chunk IDs created */
  chunkIds: z.array(z.string().uuid()),
  /** Total duration of scan in milliseconds */
  durationMs: z.number().min(0),
  /** Final status */
  status: AutoScanPhaseSchema,
  /** Results per preset */
  presetResults: z.array(PresetScanResultSchema),
  /** Error message if applicable */
  error: z.string().optional(),
});

// ===== API Request/Response Types =====

/**
 * Request to start an auto-scan
 */
export const StartAutoScanRequestSchema = z.object({
  /** Optional: override default config for this scan */
  config: AutoScanConfigSchema.partial().optional(),
  /** Optional: scan only specific presets */
  presets: z.array(z.number().int().min(0).max(9)).optional(),
});

/**
 * Response when auto-scan is started (202 Accepted)
 */
export const StartAutoScanResponseSchema = z.object({
  message: z.string(),
  scanId: z.string().uuid(),
  statusUrl: z.string(),
  totalPresets: z.number().int().min(1),
});

/**
 * Response from status endpoint
 */
export const AutoScanStatusResponseSchema = z.object({
  isRunning: z.boolean(),
  state: AutoScanStateSchema.optional(),
  lastResult: AutoScanResultSchema.optional(),
});

// ===== WebSocket Event Payloads =====

/**
 * Event: auto-scan started
 */
export const AutoScanStartedEventSchema = z.object({
  event: z.literal('autoScan:started'),
  streamId: z.string().uuid(),
  scanId: z.string().uuid(),
  totalPresets: z.number().int(),
  phase: z.literal('detection'),
  config: AutoScanConfigSchema,
});

/**
 * Event: moved to new preset position
 */
export const AutoScanPositionEventSchema = z.object({
  event: z.literal('autoScan:position'),
  streamId: z.string().uuid(),
  scanId: z.string().uuid(),
  preset: z.number().int(),
  presetName: z.string().optional(),
  phase: AutoScanPhaseSchema,
  progress: z.number().min(0).max(100),
  currentStep: z.string(),
});

/**
 * Event: detection complete at preset
 */
export const AutoScanDetectionEventSchema = z.object({
  event: z.literal('autoScan:detection'),
  streamId: z.string().uuid(),
  scanId: z.string().uuid(),
  preset: z.number().int(),
  presetName: z.string().optional(),
  horsesDetected: z.boolean(),
  horseCount: z.number().int().min(0),
});

/**
 * Event: phase changed from detection to recording
 */
export const AutoScanPhaseChangeEventSchema = z.object({
  event: z.literal('autoScan:phaseChange'),
  streamId: z.string().uuid(),
  scanId: z.string().uuid(),
  phase: AutoScanPhaseSchema,
  locationsWithHorses: z.array(z.number().int()),
  totalToRecord: z.number().int().min(0),
});

/**
 * Event: recording started at preset
 */
export const AutoScanRecordingEventSchema = z.object({
  event: z.literal('autoScan:recording'),
  streamId: z.string().uuid(),
  scanId: z.string().uuid(),
  preset: z.number().int(),
  presetName: z.string().optional(),
  chunkId: z.string().uuid(),
  progress: z.number().min(0).max(100),
});

/**
 * Event: scan completed
 */
export const AutoScanCompleteEventSchema = z.object({
  event: z.literal('autoScan:complete'),
  streamId: z.string().uuid(),
  scanId: z.string().uuid(),
  results: AutoScanResultSchema,
});

/**
 * Event: scan stopped
 */
export const AutoScanStoppedEventSchema = z.object({
  event: z.literal('autoScan:stopped'),
  streamId: z.string().uuid(),
  scanId: z.string().uuid(),
  reason: z.enum(['user', 'error', 'timeout']),
  error: z.string().optional(),
});

/**
 * Event: scan error
 */
export const AutoScanErrorEventSchema = z.object({
  event: z.literal('autoScan:error'),
  streamId: z.string().uuid(),
  scanId: z.string().uuid(),
  error: z.string(),
  preset: z.number().int().optional(),
  recoverable: z.boolean(),
});

// ===== Snapshot Detection Types =====

/**
 * Request to detect horses in a snapshot image
 */
export const SnapshotDetectionRequestSchema = z.object({
  /** Confidence threshold (default 0.3 for higher recall) */
  confidenceThreshold: z.number().min(0).max(1).default(0.3),
});

/**
 * Response from snapshot detection endpoint
 */
export const SnapshotDetectionResponseSchema = z.object({
  /** Whether any horses were detected */
  horsesDetected: z.boolean(),
  /** Number of horses detected */
  count: z.number().int().min(0),
  /** Individual detections */
  detections: z.array(
    z.object({
      /** Bounding box [x1, y1, x2, y2] */
      bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
      /** Confidence score */
      confidence: z.number().min(0).max(1),
      /** Class name (should be 'horse') */
      className: z.string().optional(),
    })
  ),
  /** Processing time in milliseconds */
  processingTimeMs: z.number().min(0),
});

// ===== Export Types =====

export type AutoScanPhase = z.infer<typeof AutoScanPhaseSchema>;
export type PTZCredentials = z.infer<typeof PTZCredentialsSchema>;
export type PTZPreset = z.infer<typeof PTZPresetSchema>;
export type PTZPresets = z.infer<typeof PTZPresetsSchema>;
export type AutoScanConfig = z.infer<typeof AutoScanConfigSchema>;
export type PresetScanResult = z.infer<typeof PresetScanResultSchema>;
export type AutoScanState = z.infer<typeof AutoScanStateSchema>;
export type AutoScanResult = z.infer<typeof AutoScanResultSchema>;
export type StartAutoScanRequest = z.infer<typeof StartAutoScanRequestSchema>;
export type StartAutoScanResponse = z.infer<typeof StartAutoScanResponseSchema>;
export type AutoScanStatusResponse = z.infer<
  typeof AutoScanStatusResponseSchema
>;

// WebSocket event types
export type AutoScanStartedEvent = z.infer<typeof AutoScanStartedEventSchema>;
export type AutoScanPositionEvent = z.infer<typeof AutoScanPositionEventSchema>;
export type AutoScanDetectionEvent = z.infer<
  typeof AutoScanDetectionEventSchema
>;
export type AutoScanPhaseChangeEvent = z.infer<
  typeof AutoScanPhaseChangeEventSchema
>;
export type AutoScanRecordingEvent = z.infer<
  typeof AutoScanRecordingEventSchema
>;
export type AutoScanCompleteEvent = z.infer<typeof AutoScanCompleteEventSchema>;
export type AutoScanStoppedEvent = z.infer<typeof AutoScanStoppedEventSchema>;
export type AutoScanErrorEvent = z.infer<typeof AutoScanErrorEventSchema>;

// Snapshot detection types
export type SnapshotDetectionRequest = z.infer<
  typeof SnapshotDetectionRequestSchema
>;
export type SnapshotDetectionResponse = z.infer<
  typeof SnapshotDetectionResponseSchema
>;

// ===== Helper Functions =====

/**
 * Validate auto-scan configuration
 */
export function validateAutoScanConfig(config: unknown): AutoScanConfig {
  return AutoScanConfigSchema.parse(config);
}

/**
 * Calculate scan progress percentage
 */
export function calculateScanProgress(
  phase: AutoScanPhase,
  currentIndex: number,
  totalDetection: number,
  totalRecording: number
): number {
  if (phase === 'idle') return 0;
  if (phase === 'complete') return 100;
  if (phase === 'stopped' || phase === 'error') return 0;

  // Detection phase: 0-50%
  if (phase === 'detection') {
    return Math.round((currentIndex / totalDetection) * 50);
  }

  // Recording phase: 50-100%
  if (phase === 'recording') {
    const recordingProgress =
      totalRecording > 0 ? currentIndex / totalRecording : 1;
    return Math.round(50 + recordingProgress * 50);
  }

  return 0;
}

/**
 * Get human-readable description of current scan step
 */
export function getScanStepDescription(
  phase: AutoScanPhase,
  preset: number,
  presetName?: string
): string {
  const locationName = presetName ? `"${presetName}"` : `Preset ${preset}`;

  switch (phase) {
    case 'idle':
      return 'Ready to start';
    case 'detection':
      return `Checking for horses at ${locationName}...`;
    case 'recording':
      return `Recording at ${locationName}...`;
    case 'complete':
      return 'Scan complete';
    case 'stopped':
      return 'Scan stopped';
    case 'error':
      return 'Scan failed';
    default:
      return 'Unknown state';
  }
}

/**
 * Generate summary text for completed scan
 */
export function generateScanSummary(result: AutoScanResult): string {
  const { totalScanned, withHorses, chunksRecorded, durationMs } = result;
  const durationSec = Math.round(durationMs / 1000);

  if (result.status === 'error') {
    return `Scan failed: ${result.error || 'Unknown error'}`;
  }

  if (result.status === 'stopped') {
    return `Scan stopped by user after checking ${totalScanned} locations`;
  }

  if (withHorses === 0) {
    return `Scanned ${totalScanned} locations in ${durationSec}s. No horses detected.`;
  }

  return `Scanned ${totalScanned} locations in ${durationSec}s. Found horses at ${withHorses} locations, recorded ${chunksRecorded} chunks.`;
}
