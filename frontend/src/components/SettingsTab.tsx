import React, { useState } from 'react';

interface CleanupStats {
  horsesDeleted?: number;
  chunksDeleted?: number;
  detectionsDeleted?: number;
  featuresDeleted?: number;
  streamHorsesDeleted?: number;
  alertsDeleted?: number;
  redisKeysCleared?: number;
  errorCount?: number;
}

// Helper to decode JWT and extract payload
const decodeJWT = (token: string): { farmId?: string; exp?: number } | null => {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const decoded = JSON.parse(atob(payload));
    return decoded;
  } catch (error) {
    console.error('Failed to decode JWT:', error);
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

export const SettingsTab: React.FC = () => {
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<CleanupStats | null>(null);

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
      const response = await fetch('http://localhost:8000/api/v1/auth/login', {
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

  const handleDeleteChunks = async () => {
    if (!confirm('Delete ALL recorded chunks and related detections? This cannot be undone.')) {
      return;
    }

    setLoading('chunks');
    setMessage(null);
    setError(null);
    setStats(null);

    try {
      const token = await getAuthToken();
      if (!token) throw new Error('Not authenticated');

      const response = await fetch(
        'http://localhost:8000/api/v1/admin/chunks',
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!response.ok) throw new Error('Failed to delete chunks');

      const data = await response.json();
      setStats(data);
      setMessage(`✅ Chunk cleanup successful!`);

      // Trigger a small delay to allow backend to fully clear Redis
      setTimeout(() => {
        // Reload the page to refresh all state
        window.location.reload();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(null);
    }
  };

  const handleDeleteHorses = async () => {
    if (!confirm('Delete ALL detected horses and ALL related data (detections, features, etc.)? This cannot be undone.')) {
      return;
    }

    setLoading('horses');
    setMessage(null);
    setError(null);
    setStats(null);

    try {
      const token = await getAuthToken();
      if (!token) throw new Error('Not authenticated');

      const response = await fetch(
        'http://localhost:8000/api/v1/admin/horses',
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!response.ok) throw new Error('Failed to delete horses');

      const data = await response.json();
      setStats(data);
      setMessage(`✅ Horse cleanup successful!`);

      // Trigger a small delay to allow backend to fully clear Redis
      setTimeout(() => {
        // Reload the page to refresh all state
        window.location.reload();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(null);
    }
  };

  const handleDeleteAll = async () => {
    if (!confirm('DELETE EVERYTHING: Remove ALL chunks AND horses?\n\nThis will:\n• Delete all video chunks (files + DB)\n• Delete all horses (DB + cache)\n• Delete all detections\n• Delete all features\n• Clear all Redis cache\n\nThis is a COMPLETE WIPE and cannot be undone!')) {
      return;
    }

    setLoading('all');
    setMessage(null);
    setError(null);
    setStats(null);

    const combinedStats: CleanupStats = {};

    try {
      const token = await getAuthToken();
      if (!token) throw new Error('Not authenticated');

      // Step 1: Delete all chunks
      setMessage('🗑️ Step 1/2: Deleting all chunks...');
      const chunksResponse = await fetch(
        'http://localhost:8000/api/v1/admin/chunks',
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!chunksResponse.ok) throw new Error('Failed to delete chunks');
      const chunksData = await chunksResponse.json();
      combinedStats.chunksDeleted = chunksData.chunksDeleted;
      combinedStats.errorCount = chunksData.errorCount || 0;

      // Step 2: Delete all horses
      setMessage('🗑️ Step 2/2: Deleting all horses...');
      const horsesResponse = await fetch(
        'http://localhost:8000/api/v1/admin/horses',
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!horsesResponse.ok) throw new Error('Failed to delete horses');
      const horsesData = await horsesResponse.json();
      combinedStats.horsesDeleted = horsesData.horsesDeleted;
      combinedStats.detectionsDeleted = horsesData.detectionsDeleted;
      combinedStats.featuresDeleted = horsesData.featuresDeleted;
      combinedStats.streamHorsesDeleted = horsesData.streamHorsesDeleted;
      combinedStats.alertsDeleted = horsesData.alertsDeleted;
      combinedStats.redisKeysCleared =
        (chunksData.redisKeysCleared || 0) + (horsesData.redisKeysCleared || 0);

      setStats(combinedStats);
      setMessage('✅ Complete cleanup successful! All data removed.');

      // Trigger a small delay to allow backend to fully clear Redis
      setTimeout(() => {
        // Reload the page to refresh all state
        window.location.reload();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(null);
    }
  };

  const renderStats = () => {
    if (!stats) return null;

    return (
      <div className="bg-slate-800/50 border border-slate-600/50 rounded-lg p-4 space-y-2">
        <h5 className="text-sm font-semibold text-slate-300 mb-3">Cleanup Summary:</h5>
        <div className="grid grid-cols-2 gap-3 text-sm">
          {stats.chunksDeleted !== undefined && (
            <div className="flex justify-between">
              <span className="text-slate-400">Chunks:</span>
              <span className="text-cyan-400 font-mono">{stats.chunksDeleted}</span>
            </div>
          )}
          {stats.horsesDeleted !== undefined && (
            <div className="flex justify-between">
              <span className="text-slate-400">Horses:</span>
              <span className="text-cyan-400 font-mono">{stats.horsesDeleted}</span>
            </div>
          )}
          {stats.detectionsDeleted !== undefined && (
            <div className="flex justify-between">
              <span className="text-slate-400">Detections:</span>
              <span className="text-cyan-400 font-mono">{stats.detectionsDeleted}</span>
            </div>
          )}
          {stats.featuresDeleted !== undefined && (
            <div className="flex justify-between">
              <span className="text-slate-400">Features:</span>
              <span className="text-cyan-400 font-mono">{stats.featuresDeleted}</span>
            </div>
          )}
          {stats.streamHorsesDeleted !== undefined && (
            <div className="flex justify-between">
              <span className="text-slate-400">Stream Horses:</span>
              <span className="text-cyan-400 font-mono">{stats.streamHorsesDeleted}</span>
            </div>
          )}
          {stats.alertsDeleted !== undefined && (
            <div className="flex justify-between">
              <span className="text-slate-400">Alerts:</span>
              <span className="text-cyan-400 font-mono">{stats.alertsDeleted}</span>
            </div>
          )}
          {stats.redisKeysCleared !== undefined && (
            <div className="flex justify-between">
              <span className="text-slate-400">Redis Keys:</span>
              <span className="text-green-400 font-mono">{stats.redisKeysCleared}</span>
            </div>
          )}
          {stats.errorCount !== undefined && stats.errorCount > 0 && (
            <div className="flex justify-between">
              <span className="text-slate-400">Errors:</span>
              <span className="text-red-400 font-mono">{stats.errorCount}</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-display font-semibold text-slate-200 mb-4">
          Developer Utilities
        </h3>
        <p className="text-sm text-slate-400 mb-6">
          Cleanup tools for testing. All deletions include PostgreSQL + Redis cache cleanup.
        </p>
      </div>

      {message && (
        <div className="bg-green-900/30 border border-green-700/50 rounded-lg p-4">
          <p className="text-green-400 text-sm font-medium">{message}</p>
        </div>
      )}

      {error && (
        <div className="bg-red-900/30 border border-red-700/50 rounded-lg p-4">
          <p className="text-red-400 text-sm font-medium">{error}</p>
        </div>
      )}

      {renderStats()}

      <div className="space-y-4">
        {/* Delete All - Calls both endpoints sequentially */}
        <div className="bg-gradient-to-br from-red-900/40 to-red-800/40 border-2 border-red-600/50 rounded-lg p-6">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <h4 className="text-base font-semibold text-red-200">
              Delete All Data
            </h4>
          </div>
          <p className="text-sm text-red-300 mb-4">
            ⚠️ <strong>Complete wipe:</strong> Sequentially calls DELETE chunks + DELETE horses.
            Removes all chunks, horses, detections, features, and clears all Redis cache.
            Use this for a completely clean slate.
          </p>
          <button
            onClick={handleDeleteAll}
            disabled={loading === 'all'}
            className="px-6 py-3 bg-red-600 hover:bg-red-700 disabled:bg-red-800 disabled:cursor-not-allowed text-white rounded-lg text-sm font-bold transition-colors shadow-lg"
          >
            {loading === 'all' ? '🗑️ Deleting All Data...' : '🔥 Delete All (Chunks + Horses)'}
          </button>
        </div>

        {/* Individual cleanup options */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
              </svg>
              <h4 className="text-base font-semibold text-slate-200">
                Delete All Chunks
              </h4>
            </div>
            <p className="text-sm text-slate-400 mb-4">
              Removes all recorded video chunks (files + DB records + detections + Redis cache)
            </p>
            <button
              onClick={handleDeleteChunks}
              disabled={loading === 'chunks'}
              className="w-full px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-orange-800 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
            >
              {loading === 'chunks' ? '🗑️ Deleting Chunks...' : 'Delete Chunks Only'}
            </button>
          </div>

          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <h4 className="text-base font-semibold text-slate-200">
                Delete All Horses
              </h4>
            </div>
            <p className="text-sm text-slate-400 mb-4">
              Removes all detected horses (DB records + detections + features + Redis cache)
            </p>
            <button
              onClick={handleDeleteHorses}
              disabled={loading === 'horses'}
              className="w-full px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-orange-800 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
            >
              {loading === 'horses' ? '🗑️ Deleting Horses...' : 'Delete Horses Only'}
            </button>
          </div>
        </div>

        {/* Info box */}
        <div className="bg-blue-900/20 border border-blue-700/30 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="text-sm text-blue-300">
              <p className="font-medium mb-1">All deletions are comprehensive:</p>
              <ul className="list-disc list-inside space-y-1 text-blue-400">
                <li>PostgreSQL database records removed</li>
                <li>Redis cache keys cleared</li>
                <li>File system chunks deleted (for chunk cleanup)</li>
                <li>All related data cascade-deleted</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
