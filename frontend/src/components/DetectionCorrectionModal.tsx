import type { CorrectionPayload, CorrectionType } from '@barnhand/shared';
import React, { useState, useEffect } from 'react';

interface TrackedHorse {
  id: string;
  name?: string;
  color: [number, number, number];
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  confidence: number;
  track_confidence: number;
  state: string;
  total_detections: number;
  horse_type?: string;
  is_official?: boolean;
  reid_confidence?: number;
}

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

interface BarnHorse {
  id: string;
  name: string;
  color: string;
  avatar_url?: string;
  is_official: boolean;
}

interface DetectionCorrectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  detection: TrackedHorse;
  frameIndex: number;
  allHorses: ChunkHorse[];
  barnHorses: BarnHorse[];
  onSubmit: (correction: CorrectionPayload) => void;
}

/**
 * DetectionCorrectionModal
 *
 * Modal for correcting horse detection assignments with three correction types:
 * 1. Reassign: Move detection to an existing horse
 * 2. New Guest: Create a new guest horse for this detection
 * 3. Mark Incorrect: Remove this detection (false positive)
 */
export const DetectionCorrectionModal: React.FC<
  DetectionCorrectionModalProps
> = ({ isOpen, onClose, detection, frameIndex, allHorses, barnHorses, onSubmit }) => {
  const [correctionType, setCorrectionType] =
    useState<CorrectionType>('reassign');
  const [targetHorseId, setTargetHorseId] = useState<string>('');
  const [newGuestName, setNewGuestName] = useState<string>('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setCorrectionType('reassign');
      setTargetHorseId('');
      setNewGuestName('');
      setShowConfirm(false);
      setError(null);
    }
  }, [isOpen]);

  // Auto-generate guest horse name
  useEffect(() => {
    if (correctionType === 'new_guest' && !newGuestName) {
      const guestCount = allHorses.filter(h =>
        h.name?.startsWith('Guest Horse')
      ).length;
      setNewGuestName(`Guest Horse ${guestCount + 1}`);
    }
  }, [correctionType, allHorses, newGuestName]);

  const handleSubmit = () => {
    // Validation
    if (correctionType === 'reassign') {
      if (!targetHorseId) {
        setError('Please select a target horse');
        return;
      }
      if (targetHorseId === detection.id) {
        setError('Cannot reassign to the same horse');
        return;
      }
    }

    if (correctionType === 'new_guest') {
      if (!newGuestName.trim()) {
        setError('Please enter a name for the new guest horse');
        return;
      }
    }

    // Build correction payload
    const correction: CorrectionPayload = {
      detection_index: parseInt(detection.id.split('_').pop() || '0'),
      frame_index: frameIndex,
      correction_type: correctionType,
      original_horse_id: detection.id,
      corrected_horse_id:
        correctionType === 'reassign' ? targetHorseId : undefined,
      corrected_horse_name:
        correctionType === 'new_guest' ? newGuestName.trim() : undefined,
    };

    // Submit correction
    onSubmit(correction);
    onClose();
  };

  const handleClose = () => {
    if (showConfirm) {
      setShowConfirm(false);
    } else {
      onClose();
    }
  };

  if (!isOpen) return null;

  // Get current horse name
  const currentHorseName = detection.name || `Horse ${detection.id}`;

  // Filter out current horse from reassign options
  const availableHorses = (allHorses || []).filter(h => h.id !== detection.id);

  // Filter barn horses that aren't already in chunk
  const availableBarnHorses = (barnHorses || []).filter(
    bh => !(allHorses || []).some(ch => ch.id === bh.id)
  );

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-slate-900 rounded-xl p-6 w-full max-w-lg mx-4 border border-slate-700 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-white">Correct Detection</h2>
          <button
            onClick={handleClose}
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
        </div>

        {/* Current Detection Info */}
        <div className="mb-6 p-4 bg-slate-800 rounded-lg border border-slate-700">
          <div className="flex items-center gap-3">
            <div
              className="w-4 h-4 rounded-full"
              style={{
                backgroundColor: `rgb(${detection.color[0]}, ${detection.color[1]}, ${detection.color[2]})`,
              }}
            />
            <div className="flex-1">
              <p className="text-white font-medium">{currentHorseName}</p>
              <p className="text-sm text-slate-400">
                Frame {frameIndex} • Confidence:{' '}
                {(detection.confidence * 100).toFixed(1)}%
              </p>
            </div>
          </div>
        </div>

        {!showConfirm ? (
          <>
            {/* Correction Type Selection */}
            <div className="space-y-4 mb-6">
              {/* Reassign Option */}
              <label className="flex items-start gap-3 p-4 rounded-lg border border-slate-700 hover:border-emerald-500 cursor-pointer transition-colors">
                <input
                  type="radio"
                  name="correctionType"
                  value="reassign"
                  checked={correctionType === 'reassign'}
                  onChange={e =>
                    setCorrectionType(e.target.value as CorrectionType)
                  }
                  className="mt-1"
                />
                <div className="flex-1">
                  <p className="text-white font-medium mb-1">
                    Reassign to existing horse
                  </p>
                  <p className="text-sm text-slate-400 mb-3">
                    Move this detection to a different horse that already exists
                    in this chunk
                  </p>
                  {correctionType === 'reassign' && (
                    <select
                      value={targetHorseId}
                      onChange={e => setTargetHorseId(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-emerald-500 focus:outline-none"
                      data-testid="target-horse-select"
                    >
                      <option value="">Select horse...</option>

                      {/* Barn Horses Section */}
                      {availableBarnHorses.length > 0 && (
                        <>
                          <option disabled className="text-slate-500">
                            ─── Your Barn Horses ───
                          </option>
                          {availableBarnHorses.map(horse => (
                            <option key={horse.id} value={horse.id}>
                              {horse.name} ⭐ (Barn Horse)
                            </option>
                          ))}
                        </>
                      )}

                      {/* Chunk Horses Section */}
                      {availableHorses.length > 0 && (
                        <>
                          <option disabled className="text-slate-500">
                            ─── Horses in This Chunk ───
                          </option>
                          {availableHorses.map(horse => (
                            <option key={horse.id} value={horse.id}>
                              {horse.name || `Horse ${horse.id}`}
                              {horse.is_official && ' ⭐'}
                              {' • '}
                              {horse.total_detections} detections
                            </option>
                          ))}
                        </>
                      )}
                    </select>
                  )}
                </div>
              </label>

              {/* New Guest Option */}
              <label className="flex items-start gap-3 p-4 rounded-lg border border-slate-700 hover:border-emerald-500 cursor-pointer transition-colors">
                <input
                  type="radio"
                  name="correctionType"
                  value="new_guest"
                  checked={correctionType === 'new_guest'}
                  onChange={e =>
                    setCorrectionType(e.target.value as CorrectionType)
                  }
                  className="mt-1"
                />
                <div className="flex-1">
                  <p className="text-white font-medium mb-1">
                    Create new guest horse
                  </p>
                  <p className="text-sm text-slate-400 mb-3">
                    This detection belongs to a horse not yet in the system
                  </p>
                  {correctionType === 'new_guest' && (
                    <input
                      type="text"
                      value={newGuestName}
                      onChange={e => setNewGuestName(e.target.value)}
                      placeholder="Enter horse name..."
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-emerald-500 focus:outline-none"
                    />
                  )}
                </div>
              </label>

              {/* Mark Incorrect Option */}
              <label className="flex items-start gap-3 p-4 rounded-lg border border-slate-700 hover:border-red-500 cursor-pointer transition-colors">
                <input
                  type="radio"
                  name="correctionType"
                  value="mark_incorrect"
                  checked={correctionType === 'mark_incorrect'}
                  onChange={e =>
                    setCorrectionType(e.target.value as CorrectionType)
                  }
                  className="mt-1"
                />
                <div className="flex-1">
                  <p className="text-white font-medium mb-1">
                    Mark as incorrect
                  </p>
                  <p className="text-sm text-slate-400">
                    This detection is a false positive and should be removed
                  </p>
                </div>
              </label>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500 rounded-lg">
                <p className="text-red-500 text-sm">{error}</p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleClose}
                className="flex-1 px-4 py-2 bg-slate-800 border border-slate-700 text-white rounded-lg hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setError(null);
                  if (correctionType === 'mark_incorrect') {
                    setShowConfirm(true);
                  } else {
                    handleSubmit();
                  }
                }}
                className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium"
              >
                Add Correction
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Confirmation for Mark Incorrect */}
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500 rounded-lg">
              <p className="text-white font-medium mb-2">Are you sure?</p>
              <p className="text-sm text-slate-300">
                This will permanently remove this detection from frame{' '}
                {frameIndex}. This action cannot be undone after processing.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 px-4 py-2 bg-slate-800 border border-slate-700 text-white rounded-lg hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
              >
                Confirm Deletion
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
