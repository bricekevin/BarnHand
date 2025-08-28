import React, { useState } from 'react';

import { StreamCard } from './StreamCard';
import { useAppStore } from '../stores/useAppStore';

export const StreamManagement: React.FC = () => {
  const { streams, addStream } = useAppStore();
  const [showAddModal, setShowAddModal] = useState(false);
  const [newStreamName, setNewStreamName] = useState('');
  const [newStreamUrl, setNewStreamUrl] = useState('');

  const handleAddStream = (e: React.FormEvent) => {
    e.preventDefault();
    if (newStreamName.trim() && newStreamUrl.trim()) {
      addStream({
        name: newStreamName.trim(),
        url: newStreamUrl.trim(),
        status: 'inactive',
        horseCount: 0,
        accuracy: 0,
        lastUpdate: new Date().toLocaleTimeString(),
      });
      setNewStreamName('');
      setNewStreamUrl('');
      setShowAddModal(false);
    }
  };

  // Mock stream data for development
  const mockStreams = [
    {
      id: 'stream-1',
      name: 'Paddock North',
      url: 'http://localhost:8003/stream1/playlist.m3u8',
      status: 'active' as const,
      horseCount: 3,
      accuracy: 94,
      lastUpdate: '2 min ago',
    },
    {
      id: 'stream-2',
      name: 'Stable Area',
      url: 'http://localhost:8003/stream2/playlist.m3u8',
      status: 'processing' as const,
      horseCount: 1,
      accuracy: 87,
      lastUpdate: '5 min ago',
    },
    {
      id: 'stream-3',
      name: 'Training Ring',
      url: 'http://localhost:8003/stream3/playlist.m3u8',
      status: 'inactive' as const,
      horseCount: 0,
      accuracy: 0,
      lastUpdate: 'Never',
    },
    {
      id: 'stream-4',
      name: 'Pasture South',
      url: 'http://localhost:8003/stream4/playlist.m3u8',
      status: 'error' as const,
      horseCount: 0,
      accuracy: 0,
      lastUpdate: '1 hour ago',
    },
  ];

  const displayStreams = streams.length > 0 ? streams : mockStreams;

  return (
    <div className="space-y-6">
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
        <div className="flex space-x-3">
          <button
            onClick={() => setShowAddModal(true)}
            className="btn-primary flex items-center space-x-2"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
                clipRule="evenodd"
              />
            </svg>
            <span>Add Stream</span>
          </button>
          <button className="btn-secondary">Start All</button>
          <button className="btn-secondary">Stop All</button>
        </div>
      </div>

      {/* Stream Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-6">
        {displayStreams.map(stream => (
          <StreamCard key={stream.id} stream={stream} />
        ))}
      </div>

      {/* Add Stream Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="glass bg-slate-900/90 rounded-xl p-6 w-full max-w-md">
            <h3 className="text-xl font-semibold text-slate-100 mb-4">
              Add New Stream
            </h3>
            <form onSubmit={handleAddStream}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Stream Name
                  </label>
                  <input
                    type="text"
                    value={newStreamName}
                    onChange={e => setNewStreamName(e.target.value)}
                    className="neu-input w-full text-slate-100 placeholder-slate-400"
                    placeholder="e.g., Paddock North"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Stream URL
                  </label>
                  <input
                    type="url"
                    value={newStreamUrl}
                    onChange={e => setNewStreamUrl(e.target.value)}
                    className="neu-input w-full text-slate-100 placeholder-slate-400"
                    placeholder="http://localhost:8003/stream1/playlist.m3u8"
                    required
                  />
                </div>
              </div>
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Add Stream
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
