import React, { useState, useEffect } from 'react';

import type { Horse } from '../../../shared/src/types/horse.types';

interface HorseActionsModalProps {
  horse: Horse;
  onClose: () => void;
  onSettings: () => void; // Open the edit modal
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
 * HorseActionsModal - Modal for viewing streams featuring a horse and accessing settings
 *
 * Features:
 * - List of streams where horse was detected
 * - Click stream to open recorded chunk tab with that chunk
 * - Settings button to open edit modal
 */
export const HorseActionsModal: React.FC<HorseActionsModalProps> = ({
  horse,
  onClose,
  onSettings,
  onSelectStream,
}) => {
  const [streams, setStreams] = useState<StreamAppearance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOfficial, setIsOfficial] = useState(horse.is_official || false);
  const [updatingOfficial, setUpdatingOfficial] = useState(false);

  // Get auth token from localStorage
  const getAuthToken = () => {
    return localStorage.getItem('authToken');
  };

  // Fetch streams featuring this horse
  useEffect(() => {
    const fetchStreams = async () => {
      setLoading(true);
      setError(null);

      try {
        const token = getAuthToken();

        if (!token) {
          throw new Error('Authentication required - please log in');
        }

        const response = await fetch(
          `http://localhost:8000/api/v1/horses/${horse.id}/streams`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!response.ok) {
          throw new Error(`Failed to fetch streams: ${response.statusText}`);
        }

        const data = await response.json();
        setStreams(data.streams || []);
      } catch (err) {
        console.error('Error fetching streams:', err);
        setError(err instanceof Error ? err.message : 'Unknown error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchStreams();
  }, [horse.id]);

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Handle stream click
  const handleStreamClick = (stream: StreamAppearance) => {
    onSelectStream(stream.stream_id, stream.latest_chunk_id);
    onClose();
  };

  // Format relative time
  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min${diffMins !== 1 ? 's' : ''} ago`;
    if (diffHours < 24)
      return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
    return date.toLocaleDateString();
  };

  // Extract tracking number from tracking_id
  const getTrackingNumber = (trackingId: string): string => {
    const match = trackingId.match(/\d+$/);
    return match ? parseInt(match[0], 10).toString() : trackingId;
  };

  const trackingNumber = getTrackingNumber(horse.tracking_id);

  // Handle official status toggle
  const handleOfficialToggle = async () => {
    const newStatus = !isOfficial;

    setUpdatingOfficial(true);
    setError(null);

    try {
      const token = getAuthToken();
      if (!token) {
        throw new Error('Authentication required - please log in');
      }

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
        throw new Error(data.message || data.error || `Failed to update official status: ${response.status}`);
      }

      // Update local state
      setIsOfficial(newStatus);
    } catch (err) {
      console.error('Error updating official status:', err);
      setError(err instanceof Error ? err.message : 'Failed to update official status');
    } finally {
      setUpdatingOfficial(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="actions-modal-title"
    >
      {/* Modal Container */}
      <div className="bg-slate-900/95 border border-slate-700/50 rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-slate-900/95 backdrop-blur-sm border-b border-slate-700/50 p-6 z-10">
          <div className="flex items-start justify-between">
            <div>
              <h2
                id="actions-modal-title"
                className="text-xl font-display font-semibold text-slate-100"
              >
                {horse.name || `Horse #${trackingNumber}`}
              </h2>
              <p className="text-sm text-slate-400 mt-1">
                View streams and manage settings
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-200 transition-colors p-1 rounded-lg hover:bg-slate-800/50"
              aria-label="Close modal"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="p-6 space-y-4">
          {/* Error Message */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
              <div className="flex items-start">
                <svg
                  className="w-5 h-5 text-red-400 mr-2 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <p className="text-red-400 text-sm">{error}</p>
              </div>
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
                    ? 'This horse is confirmed as one of the barn\'s official horses'
                    : 'Mark this horse as an official barn horse to improve Re-ID accuracy'}
                </p>
              </div>
              <button
                onClick={handleOfficialToggle}
                disabled={updatingOfficial}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-not-allowed ${
                  isOfficial ? 'bg-emerald-500' : 'bg-slate-700'
                }`}
                aria-label={isOfficial ? 'Unmark as official' : 'Mark as official'}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    isOfficial ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Settings Button */}
          <button
            onClick={() => {
              onSettings();
              onClose();
            }}
            className="w-full px-4 py-3 bg-cyan-600/20 text-cyan-400 border border-cyan-600/30 rounded-lg hover:bg-cyan-600/30 transition-colors flex items-center justify-center gap-2"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            Edit Horse Details
          </button>

          {/* Streams Section */}
          <div className="mt-6">
            <h3 className="text-sm font-medium text-slate-300 mb-3">
              Streams Featuring This Horse
            </h3>

            {loading && (
              <div className="flex items-center justify-center py-8">
                <svg
                  className="w-8 h-8 animate-spin text-cyan-400"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
              </div>
            )}


            {!loading && !error && streams.length === 0 && (
              <div className="bg-slate-800/30 rounded-lg p-6 text-center">
                <svg
                  className="w-12 h-12 mx-auto mb-3 text-slate-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
                <p className="text-sm text-slate-400">
                  No recorded streams available
                </p>
              </div>
            )}

            {!loading && !error && streams.length > 0 && (
              <div className="space-y-2">
                {streams.map(stream => (
                  <button
                    key={stream.stream_id}
                    onClick={() => handleStreamClick(stream)}
                    className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-lg hover:bg-slate-700/50 hover:border-slate-600/50 transition-all text-left group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <svg
                            className="w-4 h-4 text-slate-400 flex-shrink-0"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                            />
                          </svg>
                          <span className="font-medium text-slate-200 truncate">
                            {stream.stream_name}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                          <span>
                            Last seen: {formatRelativeTime(stream.last_seen)}
                          </span>
                          <span>•</span>
                          <span>
                            {stream.total_detections} detection
                            {stream.total_detections !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>
                      <svg
                        className="w-5 h-5 text-slate-500 group-hover:text-cyan-400 transition-colors flex-shrink-0 ml-2"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
