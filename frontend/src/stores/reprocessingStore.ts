import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { ReprocessingStatus } from '@barnhand/shared';

/**
 * ReprocessingStore
 *
 * Zustand store for tracking chunk re-processing progress.
 * Updated via WebSocket events from the ML service during re-processing.
 */

interface ReprocessingStore {
  // State
  status: ReprocessingStatus;
  progress: number; // 0-100
  currentStep: string;
  error: string | null;
  chunkId: string | null;

  // Actions
  setStatus: (status: ReprocessingStatus) => void;
  setProgress: (progress: number, step: string) => void;
  setError: (error: string) => void;
  reset: () => void;
  startProcessing: (chunkId: string) => void;
}

const initialState = {
  status: 'idle' as ReprocessingStatus,
  progress: 0,
  currentStep: '',
  error: null,
  chunkId: null,
};

export const useReprocessingStore = create<ReprocessingStore>()(
  devtools(
    set => ({
      ...initialState,

      // Set overall re-processing status
      setStatus: (status: ReprocessingStatus) => {
        set({ status });

        // Reset progress when completed or failed
        if (status === 'completed') {
          set({ progress: 100, currentStep: 'Complete!' });
        } else if (status === 'failed') {
          set({ currentStep: 'Failed' });
        }
      },

      // Update progress and current step description
      setProgress: (progress: number, step: string) => {
        set({
          progress: Math.min(100, Math.max(0, progress)),
          currentStep: step,
          status: 'running',
        });
      },

      // Set error message
      setError: (error: string) => {
        set({
          status: 'failed',
          error,
          currentStep: 'Failed',
        });
      },

      // Reset to initial state
      reset: () => {
        set(initialState);
      },

      // Start processing for a specific chunk
      startProcessing: (chunkId: string) => {
        set({
          status: 'pending',
          progress: 0,
          currentStep: 'Starting...',
          error: null,
          chunkId,
        });
      },
    }),
    {
      name: 'reprocessing-store',
    }
  )
);
