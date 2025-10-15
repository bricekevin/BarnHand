import React, { useState } from 'react';

export const SettingsTab: React.FC = () => {
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const getAuthToken = () => localStorage.getItem('authToken');

  const handleDeleteChunks = async () => {
    if (!confirm('Delete ALL recorded chunks? This cannot be undone.')) {
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
      setMessage(`Deleted ${data.deletedCount} chunks`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(null);
    }
  };

  const handleDeleteHorses = async () => {
    if (!confirm('Delete ALL detected horses? This cannot be undone.')) {
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
      setMessage(`Deleted ${data.deletedCount} horses`);
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
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-6">
          <h4 className="text-base font-semibold text-slate-200 mb-2">
            Delete All Chunks
          </h4>
          <p className="text-sm text-slate-400 mb-4">
            Removes all recorded video chunks (files + database records)
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
            Removes all detected horses from database
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
  );
};
