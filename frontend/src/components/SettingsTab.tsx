import React, { useState } from 'react';

export const SettingsTab: React.FC = () => {
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const getAuthToken = () => localStorage.getItem('authToken');

  const handleDeleteChunks = async () => {
    if (!confirm('Delete ALL recorded chunks and related detections? This cannot be undone.')) {
      return;
    }

    setLoading('chunks');
    setMessage(null);
    setError(null);

    try {
      const token = getAuthToken();
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
      const parts = [
        `${data.chunksDeleted} chunks`,
        `${data.detectionsDeleted} detections`
      ];
      setMessage(`Deleted: ${parts.join(', ')}`);
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

    try {
      const token = getAuthToken();
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
      const parts = [
        `${data.horsesDeleted} horses`,
        `${data.detectionsDeleted} detections`,
        `${data.featuresDeleted} features`,
        `${data.streamHorsesDeleted} associations`,
      ];
      setMessage(`Deleted: ${parts.join(', ')}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(null);
    }
  };

  const handleResetAll = async () => {
    if (!confirm('COMPLETE SYSTEM RESET: Delete ALL horses, chunks, detections, features, and related data? This is a FULL WIPE and cannot be undone!\n\nThis will give you a completely clean slate for testing.')) {
      return;
    }

    setLoading('reset');
    setMessage(null);
    setError(null);

    try {
      const token = getAuthToken();
      if (!token) throw new Error('Not authenticated');

      const response = await fetch(
        'http://localhost:8000/api/v1/admin/reset-all',
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to reset system');
      }

      const data = await response.json();
      const parts = [
        `${data.horsesDeleted} horses`,
        `${data.chunksDeleted} chunks`,
        `${data.detectionsDeleted} detections`,
        `${data.featuresDeleted} features`,
      ];
      setMessage(`✅ Complete reset successful! Deleted: ${parts.join(', ')}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-display font-semibold text-slate-200 mb-4">
          Developer Utilities
        </h3>
        <p className="text-sm text-slate-400 mb-6">
          Cleanup tools for testing. Use with caution.
        </p>
      </div>

      {message && (
        <div className="bg-green-900/30 border border-green-700/50 rounded-lg p-4">
          <p className="text-green-400 text-sm">{message}</p>
        </div>
      )}

      {error && (
        <div className="bg-red-900/30 border border-red-700/50 rounded-lg p-4">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      <div className="space-y-4">
        {/* Reset All - Most comprehensive option */}
        <div className="bg-gradient-to-br from-red-900/40 to-red-800/40 border-2 border-red-600/50 rounded-lg p-6">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <h4 className="text-base font-semibold text-red-200">
              Complete System Reset
            </h4>
          </div>
          <p className="text-sm text-red-300 mb-4">
            ⚠️ <strong>Full wipe:</strong> Removes ALL horses, chunks, detections, features, and related data. Use this for a completely clean slate to restart testing.
          </p>
          <button
            onClick={handleResetAll}
            disabled={loading === 'reset'}
            className="px-6 py-3 bg-red-600 hover:bg-red-700 disabled:bg-red-800 disabled:cursor-not-allowed text-white rounded-lg text-sm font-bold transition-colors shadow-lg"
          >
            {loading === 'reset' ? 'Resetting System...' : '🔥 Reset Everything'}
          </button>
        </div>

        {/* Individual cleanup options */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
            <h4 className="text-base font-semibold text-slate-200 mb-2">
              Delete All Chunks
            </h4>
            <p className="text-sm text-slate-400 mb-4">
              Removes all recorded video chunks (files + database records + related detections)
            </p>
            <button
              onClick={handleDeleteChunks}
              disabled={loading === 'chunks'}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-800 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
            >
              {loading === 'chunks' ? 'Deleting...' : 'Delete All Chunks'}
            </button>
          </div>

          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
            <h4 className="text-base font-semibold text-slate-200 mb-2">
              Delete All Horses
            </h4>
            <p className="text-sm text-slate-400 mb-4">
              Removes all detected horses, detections, features, and associations from database
            </p>
            <button
              onClick={handleDeleteHorses}
              disabled={loading === 'horses'}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-800 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
            >
              {loading === 'horses' ? 'Deleting...' : 'Delete All Horses'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
