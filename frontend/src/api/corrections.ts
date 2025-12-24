import type {
  CorrectionPayload,
  CorrectionResponse,
  ReprocessingProgress,
} from '@barnhand/shared';

const API_BASE = 'http://localhost:8000/api/v1';

// Helper to decode JWT and extract payload
const decodeJWT = (token: string): { farmId?: string; exp?: number } | null => {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const decoded = JSON.parse(atob(payload));
    return decoded;
  } catch {
    return null;
  }
};

// Check if JWT token is expired
const isTokenExpired = (token: string): boolean => {
  const decoded = decodeJWT(token);
  if (!decoded || !decoded.exp) return true;
  // Add 60 second buffer before expiry
  return Date.now() >= (decoded.exp * 1000) - 60000;
};

/**
 * Get authentication token from localStorage, auto-refreshing if expired
 */
const getAuthToken = async (): Promise<string | null> => {
  let token = localStorage.getItem('authToken');

  // Check if token exists and is not expired
  if (token && !isTokenExpired(token)) {
    return token;
  }

  // Clear expired token
  if (token) {
    console.log('🔄 Token expired, refreshing...');
    localStorage.removeItem('authToken');
  }

  // Auto-login for development
  try {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@barnhand.com', password: 'admin123' }),
    });
    if (response.ok) {
      const data = await response.json();
      token = data.accessToken;
      localStorage.setItem('authToken', token!);
      console.log('✅ New token obtained');
      return token;
    }
  } catch (err) {
    console.error('Auto-login failed:', err);
  }
  return null;
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
  const token = await getAuthToken();
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
  const token = await getAuthToken();
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
  const token = await getAuthToken();
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
  const token = await getAuthToken();
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
  const token = await getAuthToken();
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
