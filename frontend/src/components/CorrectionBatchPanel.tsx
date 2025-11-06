import type { PendingCorrection } from '@barnhand/shared';
import React, { useState } from 'react';

import { useCorrectionStore } from '../stores/correctionStore';

interface ChunkHorse {
  id: string;
  name?: string;
  color: [number, number, number];
  first_detected_frame: number;
  last_detected_frame: number;
  total_detections: number;
  avg_confidence: number;
  horse_type?: string;
  is_official?: boolean;
}

interface CorrectionBatchPanelProps {
  horses: ChunkHorse[];
  onProcessCorrections: () => void;
  isProcessing?: boolean;
}

/**
 * CorrectionBatchPanel
 *
 * Displays pending corrections and provides "Process Corrections" button.
 * Shows summary of each correction with ability to remove individual corrections.
 */
export const CorrectionBatchPanel: React.FC<CorrectionBatchPanelProps> = ({
  horses,
  onProcessCorrections,
  isProcessing = false,
}) => {
  const {
    pendingCorrections,
    removeCorrection,
    clearCorrections,
    getCorrectionCount,
  } = useCorrectionStore();

  const [showConfirm, setShowConfirm] = useState(false);

  // Helper to get horse name by ID
  const getHorseName = (horseId: string): string => {
    const horse = (horses || []).find(h => h.id === horseId);
    return horse?.name || `Horse ${horseId}`;
  };

  // Generate summary text for a correction
  const getCorrectionSummary = (correction: PendingCorrection): string => {
    const originalName = getHorseName(correction.original_horse_id);

    switch (correction.correction_type) {
      case 'reassign': {
        const targetName = correction.corrected_horse_id
          ? getHorseName(correction.corrected_horse_id)
          : 'Unknown';
        return `${originalName} → ${targetName}`;
      }
      case 'new_guest':
        return `${originalName} → ${correction.corrected_horse_name || 'New Guest'}`;
      case 'mark_incorrect':
        return `${originalName} → Deleted`;
      default:
        return 'Unknown correction';
    }
  };

  // Get correction type display text
  const getCorrectionTypeLabel = (type: string): string => {
    switch (type) {
      case 'reassign':
        return 'Reassign';
      case 'new_guest':
        return 'New Guest';
      case 'mark_incorrect':
        return 'Delete';
      default:
        return 'Unknown';
    }
  };

  // Get correction type color
  const getCorrectionTypeColor = (type: string): string => {
    switch (type) {
      case 'reassign':
        return 'bg-blue-500/20 text-blue-400 border-blue-500';
      case 'new_guest':
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500';
      case 'mark_incorrect':
        return 'bg-red-500/20 text-red-400 border-red-500';
      default:
        return 'bg-slate-500/20 text-slate-400 border-slate-500';
    }
  };

  const handleProcessClick = () => {
    setShowConfirm(true);
  };

  const handleConfirmProcess = () => {
    setShowConfirm(false);
    onProcessCorrections();
  };

  const handleClearAll = () => {
    if (confirm('Are you sure you want to discard all pending corrections?')) {
      clearCorrections();
    }
  };

  if (pendingCorrections.length === 0) {
    return null;
  }

  return (
    <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-semibold text-cyan-400 uppercase">
            Pending Corrections
          </h4>
          <span className="px-2 py-1 bg-cyan-500/20 text-cyan-400 rounded-full text-xs font-bold">
            {getCorrectionCount()}
          </span>
        </div>
        <button
          onClick={handleClearAll}
          disabled={isProcessing}
          className="text-xs text-slate-400 hover:text-red-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Clear All
        </button>
      </div>

      {!showConfirm ? (
        <>
          {/* Corrections List */}
          <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
            {pendingCorrections.map(correction => (
              <div
                key={correction.id}
                className={`p-3 rounded-lg border ${getCorrectionTypeColor(correction.correction_type)}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-slate-300">
                        Frame {correction.frame_index}
                      </span>
                      <span className="px-2 py-0.5 bg-slate-900/50 text-xs rounded">
                        {getCorrectionTypeLabel(correction.correction_type)}
                      </span>
                    </div>
                    <p className="text-sm text-white font-medium">
                      {getCorrectionSummary(correction)}
                    </p>
                  </div>
                  <button
                    onClick={() => removeCorrection(correction.id)}
                    disabled={isProcessing}
                    className="p-1 hover:bg-slate-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Remove this correction"
                  >
                    <svg
                      className="w-4 h-4 text-slate-400 hover:text-red-400"
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
                </div>
              </div>
            ))}
          </div>

          {/* Process Button */}
          <button
            onClick={handleProcessClick}
            disabled={isProcessing}
            className="w-full px-4 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg transition-colors font-semibold flex items-center justify-center gap-2"
          >
            {isProcessing ? (
              <>
                <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                <span>Processing...</span>
              </>
            ) : (
              <>
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
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <span>Process Corrections</span>
              </>
            )}
          </button>
        </>
      ) : (
        <>
          {/* Confirmation Dialog */}
          <div className="mb-4 p-4 bg-amber-500/10 border border-amber-500 rounded-lg">
            <p className="text-white font-medium mb-2">Confirm Processing</p>
            <p className="text-sm text-slate-300">
              This will apply {getCorrectionCount()} correction
              {getCorrectionCount() > 1 ? 's' : ''} and regenerate affected
              frames. This may take 10-30 seconds.
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setShowConfirm(false)}
              className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmProcess}
              className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors font-semibold"
            >
              Confirm
            </button>
          </div>
        </>
      )}
    </div>
  );
};
