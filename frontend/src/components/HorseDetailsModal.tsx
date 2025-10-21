import React, { useState, useEffect } from 'react';

import type { Horse } from '../../../shared/src/types/horse.types';

interface HorseDetailsModalProps {
  horse: Horse;
  onClose: () => void;
  onUpdate: () => void;
  onSelectStream: (streamId: string, chunkId?: string) => void;
}

interface StreamAppearance {
  stream_id: string;
  stream_name: string;
  last_seen: string;
  total_detections: number;
  latest_chunk_id?: string;
}

/**
 * HorseDetailsModal - Consolidated modal for all horse management
 *
 * Features:
 * - Official horse toggle
 * - Edit horse name and notes
 * - List of streams where horse was detected
 * - Delete horse functionality
 */
export const HorseDetailsModal: React.FC<HorseDetailsModalProps> = ({
  horse,
  onClose,
  onUpdate,
  onSelectStream,
}) => {
  // Form state
  const [name, setName] = useState(horse.name || '');
  const [notes, setNotes] = useState(
    typeof horse.metadata?.notes === 'string' ? horse.metadata.notes : ''
  );

  // Official horse state
  const [isOfficial, setIsOfficial] = useState(horse.is_official || false);
  const [updatingOfficial, setUpdatingOfficial] = useState(false);

  // Sync isOfficial state when horse prop changes
  useEffect(() => {
    setIsOfficial(horse.is_official || false);
  }, [horse.is_official]);

  // Streams state
  const [streams, setStreams] = useState<StreamAppearance[]>([]);
  const [loadingStreams, setLoadingStreams] = useState(true);

  // UI state
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const getAuthToken = () => localStorage.getItem('authToken');

  // Fetch streams featuring this horse
  useEffect(() => {
    const fetchStreams = async () => {
      setLoadingStreams(true);
      try {
        const token = getAuthToken();
        if (!token) throw new Error('Authentication required');

        const response = await fetch(
          `http://localhost:8000/api/v1/horses/${horse.id}/streams`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (!response.ok) throw new Error('Failed to fetch streams');

        const data = await response.json();
        setStreams(data.streams || []);
      } catch (err) {
        console.error('Error fetching streams:', err);
      } finally {
        setLoadingStreams(false);
      }
    };

    fetchStreams();
  }, [horse.id]);

  // Auto-clear messages
  useEffect(() => {
    if (success || error) {
      const timer = setTimeout(() => {
        setSuccess(null);
        setError(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [success, error]);

  // Handle official status toggle
  const handleOfficialToggle = async () => {
    const newStatus = !isOfficial;
    setUpdatingOfficial(true);
    setError(null);

    try {
      const token = getAuthToken();
      if (!token) throw new Error('Authentication required');

      const response = await fetch(
        `http://localhost:8000/api/v1/horses/${horse.id}/official`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ is_official: newStatus }),
        }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || data.error || 'Failed to update status');
      }

      setIsOfficial(newStatus);
      setSuccess(newStatus ? 'Marked as official horse' : 'Unmarked as official');
      onUpdate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setUpdatingOfficial(false);
    }
  };

  // Handle save
  const handleSave = async () => {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const token = getAuthToken();
      if (!token) throw new Error('Authentication required');

      const updates: any = {};
      if (name.trim() !== (horse.name || '')) {
        updates.name = name.trim();
      }
      if (notes.trim() !== ((horse.metadata?.notes as string) || '')) {
        updates.notes = notes.trim();
      }

      if (Object.keys(updates).length === 0) {
        setError('No changes to save');
        setSaving(false);
        return;
      }

      const response = await fetch(
        `http://localhost:8000/api/v1/streams/${horse.stream_id}/horses/${horse.id}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updates),
        }
      );

      if (!response.ok) throw new Error('Failed to save');

      setSuccess('Horse details updated successfully!');
      onUpdate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  // Handle delete
  const handleDelete = async () => {
    setDeleting(true);
    setError(null);

    try {
      const token = getAuthToken();
      if (!token) throw new Error('Authentication required');

      const response = await fetch(
        `http://localhost:8000/api/v1/horses/${horse.id}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!response.ok) throw new Error('Failed to delete');

      setSuccess('Horse deleted successfully!');
      setTimeout(() => {
        onUpdate();
        onClose();
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
      setDeleting(false);
    }
  };

  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin} min${diffMin !== 1 ? 's' : ''} ago`;
    if (diffHour < 24) return `${diffHour} hour${diffHour !== 1 ? 's' : ''} ago`;
    if (diffDay < 7) return `${diffDay} day${diffDay !== 1 ? 's' : ''} ago`;
    return date.toLocaleDateString();
  };

  const getTrackingNumber = (trackingId: string): string => {
    const match = trackingId.match(/\d+$/);
    return match ? parseInt(match[0], 10).toString() : trackingId;
  };

  const trackingNumber = getTrackingNumber(horse.tracking_id);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-slate-900/95 border border-slate-700/50 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-slate-900/95 backdrop-blur-sm border-b border-slate-700/50 p-6 z-10">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-display font-semibold text-slate-100">
                {horse.name || `Horse #${trackingNumber}`}
              </h2>
              <p className="text-sm text-slate-400 mt-1">
                Manage horse details and settings
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-200 transition-colors p-1 rounded-lg hover:bg-slate-800/50"
              aria-label="Close"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Messages */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}
          {success && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">
              <p className="text-emerald-400 text-sm">{success}</p>
            </div>
          )}

          {/* Official Horse Toggle */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-200">Official Horse</span>
                  {isOfficial && (
                    <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-xs font-medium rounded-full border border-emerald-500/30">
                      Official
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  {isOfficial
                    ? 'Confirmed as an official barn horse'
                    : 'Mark as official to improve Re-ID accuracy'}
                </p>
              </div>
              <button
                onClick={handleOfficialToggle}
                disabled={updatingOfficial}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${
                  isOfficial ? 'bg-emerald-500' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    isOfficial ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Edit Details */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-slate-300">Horse Details</h3>

            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-3 text-slate-300 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                placeholder="Enter horse name"
              />
              <p className="text-xs text-slate-500 mt-1">
                {name.length}/100 characters
              </p>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={500}
                rows={3}
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-3 text-slate-300 placeholder-slate-500 focus:outline-none focus:border-cyan-500 resize-none"
                placeholder="Add notes about this horse..."
              />
              <p className="text-xs text-slate-500 mt-1">
                {notes.length}/500 characters
              </p>
            </div>

            {/* Save Button */}
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full px-4 py-3 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>

          {/* Streams Section */}
          <div>
            <h3 className="text-sm font-medium text-slate-300 mb-3">
              Recorded Streams
            </h3>

            {loadingStreams && (
              <div className="flex items-center justify-center py-8">
                <svg className="w-8 h-8 animate-spin text-cyan-400" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
            )}

            {!loadingStreams && streams.length === 0 && (
              <div className="bg-slate-800/30 rounded-lg p-6 text-center">
                <svg className="w-12 h-12 mx-auto mb-3 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <p className="text-sm text-slate-400">No recorded streams available</p>
              </div>
            )}

            {!loadingStreams && streams.length > 0 && (
              <div className="space-y-2">
                {streams.map((stream) => (
                  <button
                    key={stream.stream_id}
                    onClick={() => {
                      onSelectStream(stream.stream_id, stream.latest_chunk_id);
                      onClose();
                    }}
                    className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-lg hover:bg-slate-700/50 hover:border-slate-600/50 transition-all text-left group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          <span className="font-medium text-slate-200 truncate">{stream.stream_name}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                          <span>Last seen: {formatRelativeTime(stream.last_seen)}</span>
                          <span>•</span>
                          <span>{stream.total_detections} detection{stream.total_detections !== 1 ? 's' : ''}</span>
                        </div>
                      </div>
                      <svg className="w-5 h-5 text-slate-500 group-hover:text-cyan-400 transition-colors flex-shrink-0 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Delete Section */}
          <div className="border-t border-slate-700/50 pt-6">
            {!showDeleteConfirm ? (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="w-full px-4 py-3 bg-red-500/10 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/20 transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete Horse
              </button>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-slate-300 text-center">
                  Are you sure you want to delete this horse? This action cannot be undone.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    disabled={deleting}
                    className="flex-1 px-4 py-3 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex-1 px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                  >
                    {deleting ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
