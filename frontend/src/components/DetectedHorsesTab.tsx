import React, { useState, useEffect } from 'react';

import type { Horse } from '../../../shared/src/types/horse.types';
import { HorseCard } from './HorseCard';
import { HorseDetailsModal } from './HorseDetailsModal';
import { useAppStore, useStreamHorses } from '../stores/useAppStore';
import { websocketService } from '../services/websocketService';

interface DetectedHorsesTabProps {
  streamId: string;
  onSelectStreamChunk?: (streamId: string, chunkId?: string) => void;
}

export const DetectedHorsesTab: React.FC<DetectedHorsesTabProps> = ({
  streamId,
  onSelectStreamChunk,
}) => {
  // Get horses from Zustand store (subscribes to real-time updates)
  const storeHorses = useStreamHorses(streamId);
  const setStreamHorses = useAppStore(state => state.setStreamHorses);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'detections' | 'recent'>('recent');
  const [selectedHorse, setSelectedHorse] = useState<Horse | null>(null);

  // Get auth token from localStorage (no automatic refresh to avoid login spam)
  const getAuthToken = () => {
    return localStorage.getItem('authToken');
  };

  // Initialize WebSocket connection and subscribe to stream
  useEffect(() => {
    const token = getAuthToken();

    // Connect to WebSocket server with auth token
    if (token) {
      websocketService.connect('http://localhost:8000', token);
    }

    // Subscribe to stream for real-time updates
    websocketService.subscribeToStream(streamId);

    // Cleanup: unsubscribe on unmount
    return () => {
      websocketService.unsubscribeFromStream(streamId);
    };
  }, [streamId]);

  // Fetch horses on mount and when streamId changes
  useEffect(() => {
    const fetchHorses = async () => {
      setLoading(true);
      setError(null);

      try {
        const token = getAuthToken();

        if (!token) {
          throw new Error('Authentication required - please log in');
        }

        const response = await fetch(
          `http://localhost:8000/api/v1/streams/${streamId}/horses`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!response.ok) {
          throw new Error(`Failed to fetch horses: ${response.statusText}`);
        }

        const data = await response.json();

        // Update Zustand store with fetched horses
        setStreamHorses(streamId, data.horses || []);
      } catch (err) {
        console.error('Error fetching horses:', err);
        setError(err instanceof Error ? err.message : 'Unknown error occurred');
      } finally {
        setLoading(false);
      }
    };

    if (streamId) {
      fetchHorses();
    }
    // Remove setStreamHorses from dependencies - it's stable from Zustand
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamId]);

  // Handle horse card click - now opens actions modal
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _handleHorseClick = (horse: Horse) => {
    setActionsModalHorse(horse);
  };

  // Handle settings button click - opens edit modal
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _handleSettingsClick = (horse: Horse) => {
    setSelectedHorse(horse);
  };

  // Handle modal close
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _handleModalClose = () => {
    setSelectedHorse(null);
  };

  // Handle actions modal close
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _handleActionsModalClose = () => {
    setActionsModalHorse(null);
  };

  // Handle horse save
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _handleHorseSave = async (updates: {
    name?: string;
    notes?: string;
  }) => {
    if (!selectedHorse) return;

    const token = getAuthToken();

    if (!token) {
      throw new Error('Authentication required - please log in');
    }

    // Call API to update horse
    const response = await fetch(
      `http://localhost:8000/api/v1/streams/${streamId}/horses/${selectedHorse.id}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(updates),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to update horse: ${response.statusText}`);
    }

    const data = await response.json();

    // Update Zustand store with updated horse (WebSocket will also update, but this is immediate)
    const { updateStreamHorse } = useAppStore.getState();
    updateStreamHorse(streamId, selectedHorse.id, data.horse);

    // Update selected horse
    setSelectedHorse(data.horse);
  };

  // Handle horse delete
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _handleHorseDelete = async () => {
    if (!selectedHorse) return;

    const token = getAuthToken();

    if (!token) {
      throw new Error('Authentication required - please log in');
    }

    // Call API to delete horse
    const response = await fetch(
      `http://localhost:8000/api/v1/horses/${selectedHorse.id}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to delete horse: ${response.statusText}`);
    }

    // Remove horse from Zustand store
    const { removeStreamHorse } = useAppStore.getState();
    removeStreamHorse(streamId, selectedHorse.id);

    // Close modal
    setSelectedHorse(null);
  };

  // Refresh horses manually
  const handleRefresh = async () => {
    setLoading(true);
    setError(null);

    try {
      const token = getAuthToken();

      if (!token) {
        throw new Error('Authentication required - please log in');
      }

      const response = await fetch(
        `http://localhost:8000/api/v1/streams/${streamId}/horses`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch horses: ${response.statusText}`);
      }

      const data = await response.json();
      const horses = data.horses || [];

      // Update Zustand store with fetched horses
      setStreamHorses(streamId, horses);

      // If a horse is selected, update it with the fresh data
      if (selectedHorse) {
        const updatedHorse = horses.find((h: Horse) => h.id === selectedHorse.id);
        if (updatedHorse) {
          setSelectedHorse(updatedHorse);
        }
      }
    } catch (err) {
      console.error('Error fetching horses:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  // Filter and sort horses (use storeHorses from Zustand)
  const filteredHorses = storeHorses
    .filter(horse => {
      if (!searchTerm) return true;
      const name = horse.name?.toLowerCase() || '';
      const trackingId = horse.tracking_id.toLowerCase();
      const search = searchTerm.toLowerCase();
      return name.includes(search) || trackingId.includes(search);
    })
    .sort((a, b) => {
      if (sortBy === 'detections') {
        return (b.total_detections || 0) - (a.total_detections || 0);
      } else {
        // Sort by last_seen (most recent first)
        return (
          new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime()
        );
      }
    });

  // Format relative time
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _formatRelativeTime = (dateString: string) => {
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

  // Loading state
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-display font-semibold text-slate-200">
            Detected Horses
          </h3>
          <button
            disabled
            className="px-3 py-1.5 text-sm bg-slate-700/50 text-slate-400 rounded-lg cursor-not-allowed"
          >
            <svg
              className="w-4 h-4 animate-spin"
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
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div
              key={i}
              className="bg-slate-800/50 rounded-lg h-64 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-display font-semibold text-slate-200">
            Detected Horses
          </h3>
          <button
            onClick={handleRefresh}
            className="px-3 py-1.5 text-sm bg-cyan-600/20 text-cyan-400 rounded-lg hover:bg-cyan-600/30 transition-colors"
          >
            Retry
          </button>
        </div>
        <div className="bg-slate-800/30 rounded-lg p-8 text-center">
          <div className="text-red-400 mb-4">
            <svg
              className="w-16 h-16 mx-auto mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-slate-300 mb-2">
            Error Loading Horses
          </h3>
          <p className="text-slate-400 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  // Empty state
  if (filteredHorses.length === 0 && !searchTerm) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-display font-semibold text-slate-200">
            Detected Horses
          </h3>
          <button
            onClick={handleRefresh}
            className="px-3 py-1.5 text-sm bg-cyan-600/20 text-cyan-400 rounded-lg hover:bg-cyan-600/30 transition-colors flex items-center gap-2"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            Refresh
          </button>
        </div>
        <div className="bg-slate-800/30 rounded-lg p-8 text-center">
          <div className="text-slate-400 mb-4">
            <svg
              className="w-16 h-16 mx-auto mb-4 opacity-50"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-slate-300 mb-2">
            No Horses Detected
          </h3>
          <p className="text-slate-400 text-sm">
            Horses will appear here after they are detected in video chunks.
          </p>
        </div>
      </div>
    );
  }

  // Main content with horses
  return (
    <div className="space-y-4">
      {/* Header with refresh button */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-display font-semibold text-slate-200">
          Detected Horses
          <span className="ml-2 text-sm text-slate-400 font-normal">
            ({filteredHorses.length}{' '}
            {filteredHorses.length === 1 ? 'horse' : 'horses'})
          </span>
        </h3>
        <button
          onClick={handleRefresh}
          className="px-3 py-1.5 text-sm bg-cyan-600/20 text-cyan-400 rounded-lg hover:bg-cyan-600/30 transition-colors flex items-center gap-2"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          Refresh
        </button>
      </div>

      {/* Search and filter bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search input */}
        <div className="flex-1 relative">
          <input
            type="text"
            placeholder="Search horses by name or ID..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 pl-10 bg-slate-800/50 border border-slate-700/50 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all"
          />
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>

        {/* Sort dropdown */}
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as 'detections' | 'recent')}
          className="px-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all cursor-pointer"
        >
          <option value="recent">Recently Seen</option>
          <option value="detections">Detection Count</option>
        </select>
      </div>

      {/* No results from search */}
      {filteredHorses.length === 0 && searchTerm && (
        <div className="bg-slate-800/30 rounded-lg p-6 text-center">
          <p className="text-slate-400">
            No horses found matching "{searchTerm}"
          </p>
        </div>
      )}

      {/* Horse grid */}
      {filteredHorses.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredHorses.map(horse => (
            <HorseCard
              key={horse.id}
              horse={horse}
              onClick={() => setSelectedHorse(horse)}
            />
          ))}
        </div>
      )}

      {/* Horse Details Modal */}
      {selectedHorse && (
        <HorseDetailsModal
          horse={selectedHorse}
          onClose={() => setSelectedHorse(null)}
          onUpdate={handleRefresh}
          onSelectStream={(selectedStreamId, chunkId) => {
            if (onSelectStreamChunk) {
              onSelectStreamChunk(selectedStreamId, chunkId);
            }
          }}
        />
      )}
    </div>
  );
};
