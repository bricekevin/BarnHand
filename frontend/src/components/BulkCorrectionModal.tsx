import type { CorrectionType } from '@barnhand/shared';
import React, { useState, useEffect } from 'react';

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

interface BulkCorrectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  horse: ChunkHorse;
  allHorses: ChunkHorse[];
  barnHorses: BarnHorse[];
  framesCount: number;
  onSubmit: (correctionType: CorrectionType, targetHorseIdOrName?: string) => void;
}

/**
 * BulkCorrectionModal
 *
 * Modal for bulk-correcting ALL frames where a horse appears with three options:
 * 1. Reassign: Move all detections to an existing horse
 * 2. New Guest: Create a new guest horse for all these detections
 * 3. Mark Incorrect: Remove all detections (false positive)
 */
export const BulkCorrectionModal: React.FC<BulkCorrectionModalProps> = ({
  isOpen,
  onClose,
  horse,
  allHorses,
  barnHorses,
  framesCount,
  onSubmit,
}) => {
  const [correctionType, setCorrectionType] = useState<CorrectionType>('reassign');
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
      if (targetHorseId === horse.id) {
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

    // Submit based on correction type
    if (correctionType === 'reassign') {
      onSubmit('reassign', targetHorseId);
    } else if (correctionType === 'new_guest') {
      onSubmit('new_guest', newGuestName.trim());
    } else if (correctionType === 'mark_incorrect') {
      onSubmit('mark_incorrect');
    }

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

  const horseName = horse.name || `Horse ${horse.id}`;

  // Filter out current horse and any horses without proper names
  const availableHorses = (allHorses || [])
    .filter(h => {
      // Exclude current horse
      if (h.id === horse.id) return false;

      // Exclude horses marked as deleted or with "deleted" in name
      if (h.name?.toLowerCase().includes('deleted')) return false;

      // Only include horses with valid names
      return h.name && h.name.trim().length > 0;
    })
    // Remove duplicates by ID
    .filter((h, index, self) =>
      index === self.findIndex(t => t.id === h.id)
    );

  // Filter barn horses that aren't already in chunk and have valid data
  const availableBarnHorses = (barnHorses || []).filter(
    bh => {
      // Must have a name
      if (!bh.name || bh.name.trim().length === 0) return false;

      // Exclude deleted horses
      if (bh.name.toLowerCase().includes('deleted')) return false;

      // Not already in chunk
      return !(allHorses || []).some(ch => ch.id === bh.id);
    }
  );

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-slate-900 rounded-xl p-6 w-full max-w-lg mx-4 border border-slate-700 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-white">Bulk Reassignment</h2>
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
        </div>

        {/* Current Horse Info */}
        <div className="mb-6 p-4 bg-slate-800 rounded-lg border border-slate-700">
          <div className="flex items-center gap-3">
            <div
              className="w-4 h-4 rounded-full"
              style={{
                backgroundColor: horse.color && Array.isArray(horse.color) && horse.color.length === 3
                  ? `rgb(${horse.color[0]}, ${horse.color[1]}, ${horse.color[2]})`
                  : '#06B6D4', // Fallback to cyan
              }}
            />
            <div className="flex-1">
              <p className="text-white font-medium">{horseName}</p>
              <p className="text-sm text-slate-400">
                Appears in {framesCount} frames • Avg Confidence: {(horse.avg_confidence * 100).toFixed(1)}%
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
                    Move all {framesCount} detections to a different horse that already exists
                  </p>
                  {correctionType === 'reassign' && (
                    <select
                      value={targetHorseId}
                      onChange={e => setTargetHorseId(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:border-emerald-500 focus:outline-none"
                    >
                      <option value="">Select horse...</option>

                      {/* Barn Horses Section */}
                      {availableBarnHorses.length > 0 && (
                        <>
                          <option disabled className="text-slate-500">
                            ─── Your Barn Horses ───
                          </option>
                          {availableBarnHorses.map(barnHorse => (
                            <option key={barnHorse.id} value={barnHorse.id}>
                              {barnHorse.name} ⭐ (Barn Horse)
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
                          {availableHorses.map(chunkHorse => (
                            <option key={chunkHorse.id} value={chunkHorse.id}>
                              {chunkHorse.name || `Horse ${chunkHorse.id}`}
                              {chunkHorse.is_official && ' ⭐'}
                              {' • '}
                              {chunkHorse.total_detections} detections
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
                    These {framesCount} detections belong to a horse not yet in the system
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
                    Mark all as incorrect
                  </p>
                  <p className="text-sm text-slate-400">
                    All {framesCount} detections are false positives and should be removed
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
                Add Bulk Correction
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Confirmation for Mark Incorrect */}
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500 rounded-lg">
              <p className="text-white font-medium mb-2">Are you sure?</p>
              <p className="text-sm text-slate-300">
                This will permanently remove <strong>{horseName}</strong> from all{' '}
                <strong>{framesCount} frames</strong> where it appears. This action cannot be undone after processing.
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
