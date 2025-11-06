import React, { useState } from 'react';

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
  onSubmit: (targetHorseId: string) => void;
}

/**
 * BulkCorrectionModal
 *
 * Modal for reassigning ALL frames where a horse appears to a different horse.
 * Shows warning about how many frames will be affected.
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
  const [targetHorseId, setTargetHorseId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = () => {
    if (!targetHorseId) {
      setError('Please select a target horse');
      return;
    }

    if (targetHorseId === horse.id) {
      setError('Cannot reassign to the same horse');
      return;
    }

    onSubmit(targetHorseId);
  };

  if (!isOpen) return null;

  const horseName = horse.name || `Horse ${horse.id}`;

  // Filter out current horse from reassign options
  const availableHorses = allHorses.filter(h => h.id !== horse.id);

  // Filter barn horses that aren't already in chunk
  const availableBarnHorses = (barnHorses || []).filter(
    bh => !allHorses.some(ch => ch.id === bh.id)
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

        {/* Warning */}
        <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500 rounded-lg">
          <div className="flex items-start gap-3">
            <svg
              className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <div>
              <p className="text-amber-400 font-medium mb-1">
                Bulk Reassignment
              </p>
              <p className="text-sm text-slate-300">
                This will reassign <strong className="text-amber-400">{horseName}</strong> to a different horse in <strong className="text-amber-400">{framesCount} frames</strong>.
              </p>
            </div>
          </div>
        </div>

        {/* Current Horse Info */}
        <div className="mb-6 p-4 bg-slate-800 rounded-lg border border-slate-700">
          <div className="flex items-center gap-3">
            <div
              className="w-4 h-4 rounded-full"
              style={{
                backgroundColor: `rgb(${horse.color[0]}, ${horse.color[1]}, ${horse.color[2]})`,
              }}
            />
            <div className="flex-1">
              <p className="text-white font-medium">{horseName}</p>
              <p className="text-sm text-slate-400">
                Appears in {framesCount} frames
              </p>
            </div>
          </div>
        </div>

        {/* Target Horse Selection */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Reassign to:
          </label>
          <select
            value={targetHorseId}
            onChange={e => {
              setTargetHorseId(e.target.value);
              setError(null);
            }}
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
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-slate-800 border border-slate-700 text-white rounded-lg hover:bg-slate-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="flex-1 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors font-medium"
          >
            Reassign {framesCount} Frames
          </button>
        </div>
      </div>
    </div>
  );
};
