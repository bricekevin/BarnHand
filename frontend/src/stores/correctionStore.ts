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
 */

interface CorrectionStore {
  // State
  pendingCorrections: PendingCorrection[];

  // Actions
  addCorrection: (correction: CorrectionPayload) => void;
  removeCorrection: (id: string) => void;
  clearCorrections: () => void;
  hasPendingCorrections: () => boolean;
  getCorrectionCount: () => number;
}

export const useCorrectionStore = create<CorrectionStore>()(
  devtools(
    (set, get) => ({
      // Initial state
      pendingCorrections: [],

      // Add a correction to the pending list
      addCorrection: (correction: CorrectionPayload) => {
        const pendingCorrection: PendingCorrection = {
          id: uuidv4(),
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

      // Check if there are any pending corrections
      hasPendingCorrections: () => {
        return get().pendingCorrections.length > 0;
      },

      // Get count of pending corrections
      getCorrectionCount: () => {
        return get().pendingCorrections.length;
      },
    }),
    {
      name: 'correction-store',
    }
  )
);
