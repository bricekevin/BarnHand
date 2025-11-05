import { useState, useCallback, useEffect, useRef } from 'react';
import { useCorrectionStore } from '../stores/correctionStore';
import { useReprocessingStore } from '../stores/reprocessingStore';
import {
  submitCorrections as apiSubmitCorrections,
  getReprocessingStatus as apiGetReprocessingStatus,
} from '../api/corrections';
import type { CorrectionPayload } from '@barnhand/shared';

/**
 * useCorrections Hook
 *
 * Provides methods for submitting corrections and tracking re-processing progress.
 * Handles API calls, error states, and polling for status updates.
 */
export const useCorrections = (streamId: string, chunkId: string) => {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const { pendingCorrections, clearCorrections, getCorrectionCount } =
    useCorrectionStore();
  const { setStatus, setProgress, setError: setReprocessingError, startProcessing } =
    useReprocessingStore();

  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Submit pending corrections to the API
   */
  const submitPendingCorrections = useCallback(async () => {
    if (getCorrectionCount() === 0) {
      setError('No corrections to submit');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      // Convert pending corrections to payload format
      const corrections: CorrectionPayload[] = pendingCorrections.map(pc => ({
        detection_index: pc.detection_index,
        frame_index: pc.frame_index,
        correction_type: pc.correction_type,
        original_horse_id: pc.original_horse_id,
        corrected_horse_id: pc.corrected_horse_id,
        corrected_horse_name: pc.corrected_horse_name,
      }));

      // Submit to API (returns 202 Accepted)
      const response = await apiSubmitCorrections(
        streamId,
        chunkId,
        corrections
      );

      // Clear pending corrections from store
      clearCorrections();

      // Start re-processing progress tracking
      startProcessing(chunkId);

      // Set success message
      setSuccess(
        `Processing ${response.corrections_count} correction${response.corrections_count > 1 ? 's' : ''}...`
      );

      // Start polling for status updates
      startPollingStatus();
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to submit corrections';
      setError(errorMessage);
      setReprocessingError(errorMessage);
    } finally {
      setSubmitting(false);
    }
  }, [
    streamId,
    chunkId,
    pendingCorrections,
    getCorrectionCount,
    clearCorrections,
    startProcessing,
    setReprocessingError,
  ]);

  /**
   * Poll re-processing status every 1 second
   */
  const startPollingStatus = useCallback(() => {
    // Clear any existing interval
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    // Poll immediately
    pollStatus();

    // Then poll every 1 second
    pollingIntervalRef.current = setInterval(() => {
      pollStatus();
    }, 1000);
  }, [streamId, chunkId]);

  /**
   * Fetch current re-processing status
   */
  const pollStatus = useCallback(async () => {
    try {
      const status = await apiGetReprocessingStatus(streamId, chunkId);

      // Update reprocessing store
      setStatus(status.status);
      setProgress(status.progress, status.current_step);

      // Stop polling if completed or failed
      if (
        status.status === 'completed' ||
        status.status === 'failed'
      ) {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }

        if (status.status === 'failed' && status.error) {
          setError(status.error);
        }
      }
    } catch (err) {
      console.error('Failed to poll re-processing status:', err);
      // Don't stop polling on error - might be temporary network issue
    }
  }, [streamId, chunkId, setStatus, setProgress]);

  /**
   * Stop polling when component unmounts
   */
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, []);

  /**
   * Auto-clear success/error messages after 5 seconds
   */
  useEffect(() => {
    if (success || error) {
      const timer = setTimeout(() => {
        setSuccess(null);
        setError(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [success, error]);

  return {
    submitPendingCorrections,
    submitting,
    error,
    success,
    pendingCount: getCorrectionCount(),
  };
};
