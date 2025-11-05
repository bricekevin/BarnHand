import type {
  CorrectionPayload,
  CorrectionResponse,
  ReprocessingProgress,
} from '@barnhand/shared';

const API_BASE = 'http://localhost:8000/api/v1';

/**
 * Get authentication token from localStorage
 */
const getAuthToken = (): string | null => {
  return localStorage.getItem('authToken');
};

/**
 * Submit batch corrections for a chunk
 *
 * @param streamId - Stream ID
 * @param chunkId - Chunk ID
 * @param corrections - Array of correction payloads
 * @returns Promise with correction response (202 Accepted)
 */
export const submitCorrections = async (
  streamId: string,
  chunkId: string,
  corrections: CorrectionPayload[]
): Promise<CorrectionResponse> => {
  const token = getAuthToken();
  if (!token) {
    throw new Error('Authentication required');
  }

  const response = await fetch(
    `${API_BASE}/streams/${streamId}/chunks/${chunkId}/corrections`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ corrections }),
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error || `Failed to submit corrections: ${response.status}`
    );
  }

  return response.json();
};

/**
 * Get re-processing status for a chunk
 *
 * @param streamId - Stream ID
 * @param chunkId - Chunk ID
 * @returns Promise with re-processing progress
 */
export const getReprocessingStatus = async (
  streamId: string,
  chunkId: string
): Promise<ReprocessingProgress> => {
  const token = getAuthToken();
  if (!token) {
    throw new Error('Authentication required');
  }

  const response = await fetch(
    `${API_BASE}/streams/${streamId}/chunks/${chunkId}/corrections/status`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error || `Failed to get status: ${response.status}`
    );
  }

  return response.json();
};

/**
 * Get correction history for a chunk
 *
 * @param streamId - Stream ID
 * @param chunkId - Chunk ID
 * @returns Promise with array of corrections
 */
export const getCorrectionHistory = async (
  streamId: string,
  chunkId: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any[]> => {
  const token = getAuthToken();
  if (!token) {
    throw new Error('Authentication required');
  }

  const response = await fetch(
    `${API_BASE}/streams/${streamId}/chunks/${chunkId}/corrections`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error || `Failed to get history: ${response.status}`
    );
  }

  const data = await response.json();
  return data.corrections || [];
};

/**
 * Cancel pending corrections for a chunk
 *
 * @param streamId - Stream ID
 * @param chunkId - Chunk ID
 * @returns Promise with deletion result
 */
export const cancelPendingCorrections = async (
  streamId: string,
  chunkId: string
): Promise<{ message: string; deleted_count: number }> => {
  const token = getAuthToken();
  if (!token) {
    throw new Error('Authentication required');
  }

  const response = await fetch(
    `${API_BASE}/streams/${streamId}/chunks/${chunkId}/corrections`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error || `Failed to cancel corrections: ${response.status}`
    );
  }

  return response.json();
};

/**
 * Reload chunk data after re-processing
 *
 * @param streamId - Stream ID
 * @param chunkId - Chunk ID
 * @returns Promise with fresh chunk data
 */
export const reloadChunk = async (
  streamId: string,
  chunkId: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> => {
  const token = getAuthToken();
  if (!token) {
    throw new Error('Authentication required');
  }

  const response = await fetch(
    `${API_BASE}/streams/${streamId}/chunks/${chunkId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error || `Failed to reload chunk: ${response.status}`
    );
  }

  return response.json();
};
