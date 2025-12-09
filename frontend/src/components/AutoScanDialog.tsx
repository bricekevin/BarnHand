import React, { useEffect, useState } from 'react';

// Auto-scan types (local definition to avoid module resolution issues)
type AutoScanPhase =
  | 'idle'
  | 'detection'
  | 'recording'
  | 'complete'
  | 'stopped'
  | 'error';

interface PresetScanResult {
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

interface AutoScanResult {
  scanId: string;
  streamId: string;
  totalScanned: number;
  withHorses: number;
  chunksRecorded: number;
  chunkIds: string[];
  durationMs: number;
  status: AutoScanPhase;
  presetResults: PresetScanResult[];
  error?: string;
}

interface AutoScanDialogProps {
  isOpen: boolean;
  streamId: string;
  onClose: () => void;
  onStop: () => void;
}

/**
 * AutoScanDialog
 *
 * Modal dialog showing real-time auto-scan progress. Displays:
 * - Current phase (Detection Scan / Recording Scan)
 * - Progress bar with percentage
 * - Current preset name and status
 * - Results list showing each preset status with icons
 * - Stop button to cancel the scan
 *
 * Subscribes to WebSocket events for real-time updates.
 */
export const AutoScanDialog: React.FC<AutoScanDialogProps> = ({
  isOpen,
  streamId,
  onClose,
  onStop,
}) => {
  const [phase, setPhase] = useState<AutoScanPhase>('idle');
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('Initializing...');
  const [currentPreset, setCurrentPreset] = useState<number | null>(null);
  const [totalPresets, setTotalPresets] = useState(0);
  const [results, setResults] = useState<PresetScanResult[]>([]);
  const [scanResult, setScanResult] = useState<AutoScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Subscribe to WebSocket events
  useEffect(() => {
    if (!isOpen || !streamId) return;

    // Get socket from window (set up by parent)
    const socket = (
      window as {
        socket?: {
          on: (event: string, callback: (data: unknown) => void) => void;
          off: (event: string) => void;
        };
      }
    ).socket;
    if (!socket) {
      console.warn('AutoScanDialog: No socket available');
      return;
    }

    // Type definitions for event payloads
    interface StartedPayload {
      streamId: string;
      scanId: string;
      totalPresets: number;
      phase: string;
    }
    interface PositionPayload {
      streamId: string;
      preset: number;
      presetName?: string;
      phase: string;
      progress: number;
      currentStep: string;
    }
    interface DetectionPayload {
      streamId: string;
      preset: number;
      presetName?: string;
      horsesDetected: boolean;
      horseCount: number;
    }
    interface PhaseChangePayload {
      streamId: string;
      phase: string;
      locationsWithHorses: number[];
      totalToRecord: number;
    }
    interface RecordingPayload {
      streamId: string;
      preset: number;
      presetName?: string;
      chunkId: string;
      progress: number;
    }
    interface CompletePayload {
      streamId: string;
      scanId: string;
      results: AutoScanResult;
    }
    interface StoppedPayload {
      streamId: string;
      reason: string;
    }
    interface ErrorPayload {
      streamId: string;
      error: string;
      recoverable: boolean;
    }

    // Event handlers (wrapped with type assertions for socket.on compatibility)
    const handleStarted = (rawData: unknown) => {
      const data = rawData as StartedPayload;
      if (data.streamId !== streamId) return;
      setPhase('detection');
      setTotalPresets(data.totalPresets);
      setProgress(0);
      setCurrentStep('Starting detection scan...');
      setResults([]);
      setScanResult(null);
      setError(null);
    };

    const handlePosition = (rawData: unknown) => {
      const data = rawData as PositionPayload;
      if (data.streamId !== streamId) return;
      setPhase(data.phase as AutoScanPhase);
      setProgress(data.progress);
      setCurrentPreset(data.preset);
      setCurrentStep(data.currentStep);
    };

    const handleDetection = (rawData: unknown) => {
      const data = rawData as DetectionPayload;
      if (data.streamId !== streamId) return;
      setResults(prev => [
        ...prev.filter(r => r.preset !== data.preset),
        {
          preset: data.preset,
          presetName: data.presetName,
          horsesDetected: data.horsesDetected,
          horseCount: data.horseCount,
          scannedAt: new Date().toISOString(),
        },
      ]);
    };

    const handlePhaseChange = (rawData: unknown) => {
      const data = rawData as PhaseChangePayload;
      if (data.streamId !== streamId) return;
      setPhase(data.phase as AutoScanPhase);
      setCurrentStep('Starting recording scan...');
    };

    const handleRecording = (rawData: unknown) => {
      const data = rawData as RecordingPayload;
      if (data.streamId !== streamId) return;
      setProgress(data.progress);
      setResults(prev =>
        prev.map(r =>
          r.preset === data.preset ? { ...r, chunkId: data.chunkId } : r
        )
      );
    };

    const handleComplete = (rawData: unknown) => {
      const data = rawData as CompletePayload;
      if (data.streamId !== streamId) return;
      setPhase('complete');
      setProgress(100);
      setCurrentStep('Scan complete');
      setScanResult(data.results);
    };

    const handleStopped = (rawData: unknown) => {
      const data = rawData as StoppedPayload;
      if (data.streamId !== streamId) return;
      setPhase('stopped');
      setCurrentStep('Scan stopped');
    };

    const handleError = (rawData: unknown) => {
      const data = rawData as ErrorPayload;
      if (data.streamId !== streamId) return;
      setPhase('error');
      setError(data.error);
      setCurrentStep('Scan failed');
    };

    // Subscribe
    socket.on('autoScan:started', handleStarted);
    socket.on('autoScan:position', handlePosition);
    socket.on('autoScan:detection', handleDetection);
    socket.on('autoScan:phaseChange', handlePhaseChange);
    socket.on('autoScan:recording', handleRecording);
    socket.on('autoScan:complete', handleComplete);
    socket.on('autoScan:stopped', handleStopped);
    socket.on('autoScan:error', handleError);

    // Cleanup
    return () => {
      socket.off('autoScan:started');
      socket.off('autoScan:position');
      socket.off('autoScan:detection');
      socket.off('autoScan:phaseChange');
      socket.off('autoScan:recording');
      socket.off('autoScan:complete');
      socket.off('autoScan:stopped');
      socket.off('autoScan:error');
    };
  }, [isOpen, streamId]);

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setPhase('detection');
      setProgress(0);
      setCurrentStep('Initializing...');
      setCurrentPreset(null);
      setResults([]);
      setScanResult(null);
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isRunning = phase === 'detection' || phase === 'recording';
  const isDone =
    phase === 'complete' || phase === 'stopped' || phase === 'error';

  // Get status icon for a preset result
  const getStatusIcon = (result: PresetScanResult) => {
    if (result.error) {
      return (
        <svg
          className="w-5 h-5 text-red-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      );
    }
    if (result.chunkId) {
      // Recorded successfully
      return (
        <svg
          className="w-5 h-5 text-emerald-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      );
    }
    if (result.horsesDetected) {
      // Horses found, waiting to record
      return (
        <svg
          className="w-5 h-5 text-amber-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
          />
        </svg>
      );
    }
    // No horses detected
    return (
      <svg
        className="w-5 h-5 text-slate-500"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M20 12H4"
        />
      </svg>
    );
  };

  // Get current preset being processed (not yet in results)
  const pendingPresets = Array.from(
    { length: totalPresets },
    (_, i) => i + 1
  ).filter(p => !results.find(r => r.preset === p));

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-slate-900 rounded-xl p-6 w-full max-w-lg mx-4 border border-slate-700 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            {/* Animated radar icon for active scan */}
            {isRunning && (
              <div className="relative">
                <div className="w-8 h-8 bg-emerald-500/20 rounded-full flex items-center justify-center">
                  <div className="w-4 h-4 bg-emerald-500/40 rounded-full animate-ping absolute" />
                  <svg
                    className="w-4 h-4 text-emerald-500 relative"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                    />
                  </svg>
                </div>
              </div>
            )}
            <div>
              <h2 className="text-xl font-bold text-white">
                {phase === 'detection' && 'Detection Scan'}
                {phase === 'recording' && 'Recording Scan'}
                {phase === 'complete' && 'Scan Complete'}
                {phase === 'stopped' && 'Scan Stopped'}
                {phase === 'error' && 'Scan Error'}
                {phase === 'idle' && 'Auto-Scan'}
              </h2>
              <p className="text-sm text-slate-400">{currentStep}</p>
            </div>
          </div>
          {isDone && (
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white transition-colors"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>

        {/* Progress Bar */}
        <div className="mb-6">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-slate-400">Progress</span>
            <span className="text-white font-medium">{progress}%</span>
          </div>
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                phase === 'error'
                  ? 'bg-red-500'
                  : phase === 'stopped'
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
          {/* Phase indicator */}
          <div className="flex justify-between text-xs mt-2">
            <span
              className={`${phase === 'detection' ? 'text-emerald-400' : 'text-slate-500'}`}
            >
              Detection{' '}
              {phase !== 'detection' && phase !== 'idle' ? '(Complete)' : ''}
            </span>
            <span
              className={`${phase === 'recording' ? 'text-emerald-400' : 'text-slate-500'}`}
            >
              Recording{' '}
              {phase === 'complete' || phase === 'stopped' ? '(Complete)' : ''}
            </span>
          </div>
        </div>

        {/* Results List */}
        <div className="mb-6 max-h-64 overflow-y-auto">
          <h3 className="text-sm font-medium text-slate-400 mb-3">
            Preset Results
          </h3>
          <div className="space-y-2">
            {/* Completed results */}
            {results.map(result => (
              <div
                key={result.preset}
                className={`flex items-center justify-between p-3 rounded-lg border ${
                  result.error
                    ? 'bg-red-500/10 border-red-500/30'
                    : result.horsesDetected
                      ? 'bg-emerald-500/10 border-emerald-500/30'
                      : 'bg-slate-800 border-slate-700'
                }`}
              >
                <div className="flex items-center gap-3">
                  {getStatusIcon(result)}
                  <div>
                    <p className="text-white font-medium">
                      {result.presetName || `Preset ${result.preset}`}
                    </p>
                    <p className="text-sm text-slate-400">
                      {result.error
                        ? result.error
                        : result.horsesDetected
                          ? `${result.horseCount} horse${result.horseCount !== 1 ? 's' : ''} detected`
                          : 'No horses detected'}
                    </p>
                  </div>
                </div>
                {result.chunkId && (
                  <span className="text-xs text-emerald-400 bg-emerald-500/20 px-2 py-1 rounded">
                    Recorded
                  </span>
                )}
              </div>
            ))}

            {/* Current preset being processed */}
            {isRunning &&
              currentPreset !== null &&
              !results.find(r => r.preset === currentPreset) && (
                <div className="flex items-center justify-between p-3 rounded-lg border bg-cyan-500/10 border-cyan-500/30">
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                    <div>
                      <p className="text-white font-medium">
                        Preset {currentPreset}
                      </p>
                      <p className="text-sm text-slate-400">
                        {phase === 'detection'
                          ? 'Checking for horses...'
                          : 'Recording...'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

            {/* Pending presets (only show first few) */}
            {pendingPresets.slice(0, 3).map(
              preset =>
                preset !== currentPreset && (
                  <div
                    key={preset}
                    className="flex items-center justify-between p-3 rounded-lg border bg-slate-800/50 border-slate-700/50 opacity-50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-5 h-5 rounded-full border-2 border-slate-600" />
                      <div>
                        <p className="text-slate-400 font-medium">
                          Preset {preset}
                        </p>
                        <p className="text-sm text-slate-500">Pending</p>
                      </div>
                    </div>
                  </div>
                )
            )}

            {/* Show count of remaining */}
            {pendingPresets.length > 3 && (
              <p className="text-sm text-slate-500 text-center py-2">
                +{pendingPresets.length - 3} more presets pending
              </p>
            )}
          </div>
        </div>

        {/* Summary (when complete) */}
        {scanResult && (
          <div className="mb-6 p-4 bg-slate-800 rounded-lg border border-slate-700">
            <h3 className="text-sm font-medium text-slate-400 mb-3">Summary</h3>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-white">
                  {scanResult.totalScanned}
                </p>
                <p className="text-xs text-slate-400">Locations Scanned</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-emerald-400">
                  {scanResult.withHorses}
                </p>
                <p className="text-xs text-slate-400">With Horses</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-cyan-400">
                  {scanResult.chunksRecorded}
                </p>
                <p className="text-xs text-slate-400">Chunks Recorded</p>
              </div>
            </div>
            <p className="text-sm text-slate-400 mt-3 text-center">
              Completed in {Math.round((scanResult.durationMs || 0) / 1000)}s
            </p>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3">
          {isRunning && (
            <button
              onClick={onStop}
              className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium flex items-center justify-center gap-2"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"
                />
              </svg>
              Stop Scan
            </button>
          )}
          {isDone && (
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-slate-800 border border-slate-700 text-white rounded-lg hover:bg-slate-700 transition-colors font-medium"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default AutoScanDialog;
