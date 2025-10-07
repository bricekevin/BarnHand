import React, { useState, useEffect } from 'react';

import { StreamCard } from './StreamCard';
import { PrimaryVideoPlayer } from './PrimaryVideoPlayer';
import { useAppStore } from '../stores/useAppStore';

interface BackendStream {
  id: string;
  name: string;
  status: string;
  playlistUrl: string;
  videoFile: {
    filename: string;
    duration: number;
    resolution: string;
    size: number;
  };
  startTime: string;
  restartCount: number;
}

interface StreamData {
  id: string;
  name: string;
  url: string;
  status: 'active' | 'inactive' | 'processing' | 'error';
}

export const StreamManagement: React.FC = () => {
  const { selectedStream, setSelectedStream, streams: customStreams } = useAppStore();
  const [localStreams, setLocalStreams] = useState<StreamData[]>([]);
  const [loading, setLoading] = useState(true);

  const handleBackgroundClick = (e: React.MouseEvent) => {
    // Only unselect if clicking on the background (not on video elements)
    if (e.target === e.currentTarget) {
      setSelectedStream(null);
    }
  };

  // Fetch active streams from backend video-streamer
  const fetchLocalStreams = async () => {
    try {
      const response = await fetch('http://localhost:8003/api/streams');
      const data = await response.json();

      const streamData: StreamData[] = data.streams
        .filter((stream: BackendStream) => stream.status === 'active')
        .map((stream: BackendStream) => ({
          id: stream.id,
          name: stream.videoFile.filename.replace('.mp4', '').replace(/[_-]/g, ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),
          url: stream.playlistUrl,
          status: stream.status === 'active' ? 'active' : 'inactive' as const,
        }));

      setLocalStreams(streamData);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch local streams:', error);
      setLocalStreams([]);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLocalStreams();
    // Refresh local streams every 10 seconds
    const interval = setInterval(fetchLocalStreams, 10000);
    return () => clearInterval(interval);
  }, []);

  // Combine local streams and custom streams
  const combinedStreams: StreamData[] = [
    ...localStreams,
    ...customStreams.filter(stream => !localStreams.find(local => local.id === stream.id)).map(stream => ({
      id: stream.id,
      name: stream.name,
      url: stream.url,
      status: stream.status,
    }))
  ];

  // Debug logging
  console.log('Local streams:', localStreams);
  console.log('Custom streams:', customStreams);
  console.log('Combined streams:', combinedStreams);

  const displayStreams = combinedStreams;
  const selectedStreamData = selectedStream ? displayStreams.find(s => s.id === selectedStream) : null;
  const otherStreams = selectedStreamData ? displayStreams.filter(s => s.id !== selectedStream) : displayStreams;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-display font-bold text-slate-100">
              Live Streams
            </h2>
            <p className="text-slate-400 mt-1">Loading streams...</p>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-6">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-slate-800/50 rounded-lg h-64 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (displayStreams.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-display font-bold text-slate-100">
              Live Streams
            </h2>
            <p className="text-slate-400 mt-1">No active streams</p>
          </div>
        </div>
        <div className="bg-slate-800/30 rounded-lg p-8 text-center">
          <div className="text-slate-400 mb-4">
            <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-slate-300 mb-2">No Active Streams</h3>
          <p className="text-slate-400 text-sm">
            Start streams from the Settings → Stream Control tab to see video feeds here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" onClick={handleBackgroundClick}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display font-bold text-slate-100">
            Live Streams
          </h2>
          <p className="text-slate-400 mt-1">
            {displayStreams.filter(s => s.status === 'active').length} of{' '}
            {displayStreams.length} streams active
          </p>
        </div>
      </div>

      {selectedStreamData ? (
        <>
          {/* Selected Stream - Large Player with Chunk Recording */}
          <div className="mb-6">
            <PrimaryVideoPlayer
              stream={selectedStreamData}
              onClose={() => setSelectedStream(null)}
            />
          </div>

          {/* Other Streams - Thumbnail Grid */}
          {otherStreams.length > 0 && (
            <div>
              <h3 className="text-lg font-display font-semibold text-slate-200 mb-4">
                Other Streams
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {otherStreams.map(stream => (
                  <StreamCard key={stream.id} stream={stream} thumbnail={true} />
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        /* Default Grid View */
        <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-6">
          {displayStreams.map(stream => (
            <StreamCard key={stream.id} stream={stream} />
          ))}
        </div>
      )}
    </div>
  );
};