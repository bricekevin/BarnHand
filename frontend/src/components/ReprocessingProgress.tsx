import React, { useEffect } from 'react';
import { useReprocessingStore } from '../stores/reprocessingStore';

interface ReprocessingProgressProps {
  onComplete?: () => void;
}

/**
 * ReprocessingProgress
 *
 * Real-time progress indicator for chunk re-processing.
 * Shows progress bar, current step, and error state.
 * Auto-hides when idle or complete after delay.
 */
export const ReprocessingProgress: React.FC<ReprocessingProgressProps> = ({
  onComplete,
}) => {
  const { status, progress, currentStep, error, reset } =
    useReprocessingStore();

  // Call onComplete callback when processing completes
  useEffect(() => {
    if (status === 'completed' && onComplete) {
      onComplete();

      // Auto-hide after 3 seconds
      const timer = setTimeout(() => {
        reset();
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [status, onComplete, reset]);

  // Don't render if idle
  if (status === 'idle') {
    return null;
  }

  // Get status color
  const getStatusColor = () => {
    switch (status) {
      case 'pending':
        return 'bg-amber-500';
      case 'running':
        return 'bg-cyan-500';
      case 'completed':
        return 'bg-emerald-500';
      case 'failed':
        return 'bg-red-500';
      default:
        return 'bg-slate-500';
    }
  };

  // Get status text
  const getStatusText = () => {
    switch (status) {
      case 'pending':
        return 'Queued';
      case 'running':
        return 'Processing';
      case 'completed':
        return 'Complete';
      case 'failed':
        return 'Failed';
      default:
        return 'Unknown';
    }
  };

  return (
    <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-semibold text-cyan-400 uppercase">
            Re-Processing Chunk
          </h4>
          <span
            className={`px-2 py-1 ${getStatusColor()}/20 text-white rounded-full text-xs font-bold`}
          >
            {getStatusText()}
          </span>
        </div>
        {status === 'running' && (
          <span className="text-sm font-mono text-slate-300">
            {progress.toFixed(0)}%
          </span>
        )}
      </div>

      {/* Progress Bar */}
      {status !== 'failed' && (
        <div className="mb-3">
          <div className="w-full bg-slate-700 rounded-full h-2 overflow-hidden">
            <div
              className={`h-full ${getStatusColor()} transition-all duration-500 ease-out`}
              style={{ width: `${progress}%` }}
            >
              {/* Animated shine effect */}
              <div className="h-full w-full bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer"></div>
            </div>
          </div>
        </div>
      )}

      {/* Current Step or Error */}
      <div className="flex items-start gap-2">
        {status === 'running' && (
          <div className="flex-shrink-0">
            <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-cyan-400"></div>
          </div>
        )}
        {status === 'completed' && (
          <div className="flex-shrink-0">
            <svg
              className="w-4 h-4 text-emerald-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
        )}
        {status === 'failed' && (
          <div className="flex-shrink-0">
            <svg
              className="w-4 h-4 text-red-400"
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
          </div>
        )}
        <div className="flex-1">
          {error ? (
            <div className="text-red-400 text-sm">{error}</div>
          ) : (
            <div className="text-slate-300 text-sm">{currentStep}</div>
          )}
        </div>
      </div>

      {/* Processing Steps Guide */}
      {status === 'running' && (
        <div className="mt-4 pt-4 border-t border-slate-700">
          <div className="grid grid-cols-5 gap-2 text-xs">
            <div
              className={`text-center ${progress >= 20 ? 'text-cyan-400' : 'text-slate-500'}`}
            >
              <div className="mb-1">Apply</div>
              <div
                className={`h-1 rounded ${progress >= 20 ? 'bg-cyan-400' : 'bg-slate-700'}`}
              ></div>
            </div>
            <div
              className={`text-center ${progress >= 40 ? 'text-cyan-400' : 'text-slate-500'}`}
            >
              <div className="mb-1">ReID</div>
              <div
                className={`h-1 rounded ${progress >= 40 ? 'bg-cyan-400' : 'bg-slate-700'}`}
              ></div>
            </div>
            <div
              className={`text-center ${progress >= 60 ? 'text-cyan-400' : 'text-slate-500'}`}
            >
              <div className="mb-1">Frames</div>
              <div
                className={`h-1 rounded ${progress >= 60 ? 'bg-cyan-400' : 'bg-slate-700'}`}
              ></div>
            </div>
            <div
              className={`text-center ${progress >= 80 ? 'text-cyan-400' : 'text-slate-500'}`}
            >
              <div className="mb-1">Video</div>
              <div
                className={`h-1 rounded ${progress >= 80 ? 'bg-cyan-400' : 'bg-slate-700'}`}
              ></div>
            </div>
            <div
              className={`text-center ${progress >= 100 ? 'text-cyan-400' : 'text-slate-500'}`}
            >
              <div className="mb-1">Save</div>
              <div
                className={`h-1 rounded ${progress >= 100 ? 'bg-cyan-400' : 'bg-slate-700'}`}
              ></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
