import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { useCorrections } from '../useCorrections';
import * as correctionsApi from '../../api/corrections';
import { useCorrectionStore } from '../../stores/correctionStore';
import { useReprocessingStore } from '../../stores/reprocessingStore';

// Mock the stores
vi.mock('../../stores/correctionStore');
vi.mock('../../stores/reprocessingStore');
vi.mock('../../api/corrections');

describe('useCorrections', () => {
  const mockStreamId = 'stream-123';
  const mockChunkId = 'chunk-456';

  const mockClearCorrections = vi.fn();
  const mockGetCorrectionCount = vi.fn();
  const mockSetStatus = vi.fn();
  const mockSetProgress = vi.fn();
  const mockSetError = vi.fn();
  const mockStartProcessing = vi.fn();

  const mockPendingCorrections = [
    {
      id: 'correction-1',
      detection_index: 0,
      frame_index: 42,
      correction_type: 'reassign' as const,
      original_horse_id: 'horse_1',
      corrected_horse_id: 'horse_2',
      created_at: '2025-01-01T00:00:00Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Mock correction store
    (useCorrectionStore as any).mockReturnValue({
      pendingCorrections: mockPendingCorrections,
      clearCorrections: mockClearCorrections,
      getCorrectionCount: mockGetCorrectionCount,
    });

    mockGetCorrectionCount.mockReturnValue(1);

    // Mock reprocessing store
    (useReprocessingStore as any).mockReturnValue({
      setStatus: mockSetStatus,
      setProgress: mockSetProgress,
      setError: mockSetError,
      startProcessing: mockStartProcessing,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initializes with correct default values', () => {
    const { result } = renderHook(() =>
      useCorrections(mockStreamId, mockChunkId)
    );

    expect(result.current.submitting).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.success).toBeNull();
    expect(result.current.pendingCount).toBe(1);
  });

  it('submits corrections successfully', async () => {
    const mockResponse = {
      message: 'Corrections queued',
      reprocessing_url: 'http://localhost:8000/api/v1/streams/stream-123/chunks/chunk-456/corrections/status',
      corrections_count: 1,
      chunk_id: mockChunkId,
    };

    vi.spyOn(correctionsApi, 'submitCorrections').mockResolvedValue(
      mockResponse
    );

    const { result } = renderHook(() =>
      useCorrections(mockStreamId, mockChunkId)
    );

    await act(async () => {
      await result.current.submitPendingCorrections();
    });

    expect(correctionsApi.submitCorrections).toHaveBeenCalledWith(
      mockStreamId,
      mockChunkId,
      [
        {
          detection_index: 0,
          frame_index: 42,
          correction_type: 'reassign',
          original_horse_id: 'horse_1',
          corrected_horse_id: 'horse_2',
        },
      ]
    );

    expect(mockClearCorrections).toHaveBeenCalled();
    expect(mockStartProcessing).toHaveBeenCalledWith(mockChunkId);
    expect(result.current.success).toBe('Processing 1 correction...');
  });

  it('handles plural corrections in success message', async () => {
    const mockResponse = {
      message: 'Corrections queued',
      reprocessing_url: 'http://localhost:8000/api/v1/streams/stream-123/chunks/chunk-456/corrections/status',
      corrections_count: 3,
      chunk_id: mockChunkId,
    };

    vi.spyOn(correctionsApi, 'submitCorrections').mockResolvedValue(
      mockResponse
    );

    const { result } = renderHook(() =>
      useCorrections(mockStreamId, mockChunkId)
    );

    await act(async () => {
      await result.current.submitPendingCorrections();
    });

    expect(result.current.success).toBe('Processing 3 corrections...');
  });

  it('handles submission error', async () => {
    const errorMessage = 'Network error';
    vi.spyOn(correctionsApi, 'submitCorrections').mockRejectedValue(
      new Error(errorMessage)
    );

    const { result } = renderHook(() =>
      useCorrections(mockStreamId, mockChunkId)
    );

    await act(async () => {
      await result.current.submitPendingCorrections();
    });

    expect(result.current.error).toBe(errorMessage);
    expect(mockSetError).toHaveBeenCalledWith(errorMessage);
    expect(mockClearCorrections).not.toHaveBeenCalled();
  });

  it('prevents submission when no corrections', async () => {
    mockGetCorrectionCount.mockReturnValue(0);

    const { result } = renderHook(() =>
      useCorrections(mockStreamId, mockChunkId)
    );

    await act(async () => {
      await result.current.submitPendingCorrections();
    });

    expect(result.current.error).toBe('No corrections to submit');
    expect(correctionsApi.submitCorrections).not.toHaveBeenCalled();
  });

  it('polls status after submission', async () => {
    const mockResponse = {
      message: 'Corrections queued',
      reprocessing_url: 'http://localhost:8000/api/v1/streams/stream-123/chunks/chunk-456/corrections/status',
      corrections_count: 1,
      chunk_id: mockChunkId,
    };

    const mockStatus = {
      chunk_id: mockChunkId,
      status: 'running' as const,
      progress: 50,
      current_step: 'Regenerating frames...',
    };

    vi.spyOn(correctionsApi, 'submitCorrections').mockResolvedValue(
      mockResponse
    );
    vi.spyOn(correctionsApi, 'getReprocessingStatus').mockResolvedValue(
      mockStatus
    );

    const { result } = renderHook(() =>
      useCorrections(mockStreamId, mockChunkId)
    );

    await act(async () => {
      await result.current.submitPendingCorrections();
    });

    // Immediately polls
    await waitFor(() => {
      expect(correctionsApi.getReprocessingStatus).toHaveBeenCalledWith(
        mockStreamId,
        mockChunkId
      );
    });

    // Polls again after 1 second
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    await waitFor(() => {
      expect(correctionsApi.getReprocessingStatus).toHaveBeenCalledTimes(2);
    });
  });

  it('stops polling when status is completed', async () => {
    const mockResponse = {
      message: 'Corrections queued',
      reprocessing_url: 'http://localhost:8000/api/v1/streams/stream-123/chunks/chunk-456/corrections/status',
      corrections_count: 1,
      chunk_id: mockChunkId,
    };

    const mockStatus = {
      chunk_id: mockChunkId,
      status: 'completed' as const,
      progress: 100,
      current_step: 'Complete!',
    };

    vi.spyOn(correctionsApi, 'submitCorrections').mockResolvedValue(
      mockResponse
    );
    vi.spyOn(correctionsApi, 'getReprocessingStatus').mockResolvedValue(
      mockStatus
    );

    const { result } = renderHook(() =>
      useCorrections(mockStreamId, mockChunkId)
    );

    await act(async () => {
      await result.current.submitPendingCorrections();
    });

    await waitFor(() => {
      expect(mockSetStatus).toHaveBeenCalledWith('completed');
    });

    // Advance time - should not poll again
    const callCount = (correctionsApi.getReprocessingStatus as any).mock.calls
      .length;

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(correctionsApi.getReprocessingStatus).toHaveBeenCalledTimes(
      callCount
    );
  });

  it('stops polling when status is failed', async () => {
    const mockResponse = {
      message: 'Corrections queued',
      reprocessing_url: 'http://localhost:8000/api/v1/streams/stream-123/chunks/chunk-456/corrections/status',
      corrections_count: 1,
      chunk_id: mockChunkId,
    };

    const mockStatus = {
      chunk_id: mockChunkId,
      status: 'failed' as const,
      progress: 30,
      current_step: 'Failed',
      error: 'Frame regeneration failed',
    };

    vi.spyOn(correctionsApi, 'submitCorrections').mockResolvedValue(
      mockResponse
    );
    vi.spyOn(correctionsApi, 'getReprocessingStatus').mockResolvedValue(
      mockStatus
    );

    const { result } = renderHook(() =>
      useCorrections(mockStreamId, mockChunkId)
    );

    await act(async () => {
      await result.current.submitPendingCorrections();
    });

    await waitFor(() => {
      expect(mockSetStatus).toHaveBeenCalledWith('failed');
      expect(result.current.error).toBe('Frame regeneration failed');
    });
  });

  it('clears success and error messages after 5 seconds', async () => {
    const mockResponse = {
      message: 'Corrections queued',
      reprocessing_url: 'http://localhost:8000/api/v1/streams/stream-123/chunks/chunk-456/corrections/status',
      corrections_count: 1,
      chunk_id: mockChunkId,
    };

    vi.spyOn(correctionsApi, 'submitCorrections').mockResolvedValue(
      mockResponse
    );

    const { result } = renderHook(() =>
      useCorrections(mockStreamId, mockChunkId)
    );

    await act(async () => {
      await result.current.submitPendingCorrections();
    });

    expect(result.current.success).toBeTruthy();

    // Fast-forward 5 seconds
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    await waitFor(() => {
      expect(result.current.success).toBeNull();
    });
  });

  it('cleans up polling on unmount', async () => {
    const mockResponse = {
      message: 'Corrections queued',
      reprocessing_url: 'http://localhost:8000/api/v1/streams/stream-123/chunks/chunk-456/corrections/status',
      corrections_count: 1,
      chunk_id: mockChunkId,
    };

    vi.spyOn(correctionsApi, 'submitCorrections').mockResolvedValue(
      mockResponse
    );
    vi.spyOn(correctionsApi, 'getReprocessingStatus').mockResolvedValue({
      chunk_id: mockChunkId,
      status: 'running' as const,
      progress: 50,
      current_step: 'Processing...',
    });

    const { result, unmount } = renderHook(() =>
      useCorrections(mockStreamId, mockChunkId)
    );

    await act(async () => {
      await result.current.submitPendingCorrections();
    });

    const callCountBeforeUnmount = (
      correctionsApi.getReprocessingStatus as any
    ).mock.calls.length;

    unmount();

    // Advance time - should not poll after unmount
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(correctionsApi.getReprocessingStatus).toHaveBeenCalledTimes(
      callCountBeforeUnmount
    );
  });

  it('handles polling errors gracefully', async () => {
    const mockResponse = {
      message: 'Corrections queued',
      reprocessing_url: 'http://localhost:8000/api/v1/streams/stream-123/chunks/chunk-456/corrections/status',
      corrections_count: 1,
      chunk_id: mockChunkId,
    };

    vi.spyOn(correctionsApi, 'submitCorrections').mockResolvedValue(
      mockResponse
    );

    // First call succeeds, second fails, third succeeds
    vi.spyOn(correctionsApi, 'getReprocessingStatus')
      .mockResolvedValueOnce({
        chunk_id: mockChunkId,
        status: 'running' as const,
        progress: 25,
        current_step: 'Applying...',
      })
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        chunk_id: mockChunkId,
        status: 'running' as const,
        progress: 75,
        current_step: 'Almost done...',
      });

    const { result } = renderHook(() =>
      useCorrections(mockStreamId, mockChunkId)
    );

    await act(async () => {
      await result.current.submitPendingCorrections();
    });

    // Wait for first poll
    await waitFor(() => {
      expect(mockSetProgress).toHaveBeenCalledWith(25, 'Applying...');
    });

    // Advance to second poll (will fail)
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    await waitFor(() => {
      expect(correctionsApi.getReprocessingStatus).toHaveBeenCalledTimes(2);
    });

    // Advance to third poll (will succeed)
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    await waitFor(() => {
      expect(mockSetProgress).toHaveBeenCalledWith(75, 'Almost done...');
    });
  });
});
