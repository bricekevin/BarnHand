import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { PendingCorrection, CorrectionPayload } from '@barnhand/shared';
import { v4 as uuidv4 } from 'uuid';

/**
 * CorrectionStore
 *
 * Zustand store for managing pending detection corrections before submission.
 * Corrections are queued here when user clicks "Add Correction" in the modal,
 * then submitted as a batch when user clicks "Process Corrections".
 *
 * IMPORTANT: Corrections are scoped by chunk_id - each chunk has its own set of
 * pending corrections. This prevents corrections from one chunk appearing on another.
 */

interface CorrectionStore {
  // State
  pendingCorrections: PendingCorrection[];

  // Actions
  addCorrection: (chunkId: string, correction: CorrectionPayload) => void;
  removeCorrection: (id: string) => void;
  clearCorrections: () => void;
  clearCorrectionsForChunk: (chunkId: string) => void;
  hasPendingCorrections: () => boolean;
  hasPendingCorrectionsForChunk: (chunkId: string) => boolean;
  getCorrectionCount: () => number;
  getCorrectionCountForChunk: (chunkId: string) => number;
  getCorrectionsForChunk: (chunkId: string) => PendingCorrection[];
}

export const useCorrectionStore = create<CorrectionStore>()(
  devtools(
    (set, get) => ({
      // Initial state
      pendingCorrections: [],

      // Add a correction to the pending list (scoped by chunkId)
      addCorrection: (chunkId: string, correction: CorrectionPayload) => {
        const pendingCorrection: PendingCorrection = {
          id: uuidv4(),
          chunk_id: chunkId,
          detection_index: correction.detection_index,
          frame_index: correction.frame_index,
          correction_type: correction.correction_type,
          original_horse_id: correction.original_horse_id,
          corrected_horse_id: correction.corrected_horse_id,
          corrected_horse_name: correction.corrected_horse_name,
          created_at: new Date().toISOString(),
        };

        set(state => ({
          pendingCorrections: [...state.pendingCorrections, pendingCorrection],
        }));
      },

      // Remove a specific correction by ID
      removeCorrection: (id: string) => {
        set(state => ({
          pendingCorrections: state.pendingCorrections.filter(c => c.id !== id),
        }));
      },

      // Clear all pending corrections (after successful submission or user cancel)
      clearCorrections: () => {
        set({ pendingCorrections: [] });
      },

      // Clear corrections for a specific chunk only
      clearCorrectionsForChunk: (chunkId: string) => {
        set(state => ({
          pendingCorrections: state.pendingCorrections.filter(c => c.chunk_id !== chunkId),
        }));
      },

      // Check if there are any pending corrections (across all chunks)
      hasPendingCorrections: () => {
        return get().pendingCorrections.length > 0;
      },

      // Check if there are pending corrections for a specific chunk
      hasPendingCorrectionsForChunk: (chunkId: string) => {
        return get().pendingCorrections.some(c => c.chunk_id === chunkId);
      },

      // Get count of pending corrections (across all chunks)
      getCorrectionCount: () => {
        return get().pendingCorrections.length;
      },

      // Get count of pending corrections for a specific chunk
      getCorrectionCountForChunk: (chunkId: string) => {
        return get().pendingCorrections.filter(c => c.chunk_id === chunkId).length;
      },

      // Get all corrections for a specific chunk
      getCorrectionsForChunk: (chunkId: string) => {
        return get().pendingCorrections.filter(c => c.chunk_id === chunkId);
      },
    }),
    {
      name: 'correction-store',
    }
  )
);
