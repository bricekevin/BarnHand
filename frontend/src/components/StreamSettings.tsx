import React, { useState } from 'react';

import { useAppStore, useStreams } from '../stores/useAppStore';

interface StreamFormData {
  name: string;
  url: string;
  type: 'local' | 'rtsp' | 'rtmp' | 'http';
  config: {
    username?: string;
    password?: string;
    useAuth?: boolean;
  };
}

export const StreamSettings: React.FC = () => {
  const streams = useStreams();
  const { addStream, updateStream, removeStream } = useAppStore();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingStream, setEditingStream] = useState<string | null>(null);
  const [formData, setFormData] = useState<StreamFormData>({
    name: '',
    url: '',
    type: 'rtsp',
    config: {
      username: '',
      password: '',
      useAuth: false,
    },
  });

  const resetForm = () => {
    setFormData({
      name: '',
      url: '',
      type: 'rtsp',
      config: {
        username: '',
        password: '',
        useAuth: false,
      },
    });
    setShowAddForm(false);
    setEditingStream(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const streamData = {
      name: formData.name,
      url: formData.url,
      type: formData.type,
      config: formData.config,
    };

    if (editingStream) {
      updateStream(editingStream, streamData);
    } else {
      // Add stream as active for immediate testing
      const newStream = {
        ...streamData,
        status: 'active' as const, // Set as active so it shows in dashboard
      };

      console.log('Adding new stream:', newStream);
      addStream(newStream);

      // Log current streams after adding
      setTimeout(() => {
        console.log('Current streams after adding:', useAppStore.getState().streams);
      }, 100);
    }

    resetForm();
  };

  const handleEdit = (stream: any) => {
    setFormData({
      name: stream.name,
      url: stream.url,
      type: stream.type,
      config: stream.config || {
        username: '',
        password: '',
        useAuth: false,
      },
    });
    setEditingStream(stream.id);
    setShowAddForm(true);
  };

  const handleDelete = async (streamId: string) => {
    if (confirm('Are you sure you want to delete this stream?')) {
      const stream = streams.find(s => s.id === streamId);

      // If it's a local stream, stop it in Stream Control first
      if (stream && stream.type === 'local' && streamId.startsWith('stream_')) {
        console.log(`🔄 Stopping local stream ${streamId} via Stream Control API`);
        try {
          const response = await fetch(`http://localhost:8003/api/streams/stop/${streamId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
          });

          if (response.ok) {
            console.log(`✅ Local stream ${streamId} stopped successfully`);
          } else {
            console.warn(`⚠️ Failed to stop local stream ${streamId}:`, response.status);
          }
        } catch (error) {
          console.warn(`⚠️ Network error stopping local stream ${streamId}:`, error);
        }
      }

      removeStream(streamId);
    }
  };

  const getStreamTypeIcon = (type: string) => {
    switch (type) {
      case 'rtsp': return '📹';
      case 'rtmp': return '📺';
      case 'http': return '🌐';
      case 'local': return '💽';
      default: return '📹';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-success';
      case 'processing': return 'text-amber-400';
      case 'error': return 'text-error';
      default: return 'text-slate-400';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display font-bold text-slate-100">
            Stream Settings
          </h2>
          <p className="text-slate-400 mt-1">
            Add, edit, and manage video stream sources
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="btn-primary flex items-center"
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          Add Stream
        </button>
      </div>

      {/* Add/Edit Form */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-900 rounded-xl p-6 w-full max-w-2xl mx-4 border border-slate-700">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-slate-100">
                {editingStream ? 'Edit Stream' : 'Add New Stream'}
              </h3>
              <button
                onClick={resetForm}
                className="text-slate-400 hover:text-slate-300 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Basic Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Stream Name
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-300 focus:outline-none focus:border-cyan-500"
                    placeholder="My Camera Stream"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Stream Type
                  </label>
                  <select
                    value={formData.type}
                    onChange={e => setFormData({ ...formData, type: e.target.value as any })}
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-300 focus:outline-none focus:border-cyan-500"
                  >
                    <option value="rtsp">RTSP</option>
                    <option value="rtmp">RTMP</option>
                    <option value="http">HTTP/HLS</option>
                    <option value="local">Local File</option>
                  </select>
                </div>
              </div>

              {/* Stream URL */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Stream URL
                </label>
                <input
                  type="url"
                  value={formData.url}
                  onChange={e => setFormData({ ...formData, url: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-300 focus:outline-none focus:border-cyan-500"
                  placeholder="rtsp://camera.example.com:554/stream"
                  required
                />
                <p className="text-xs text-slate-400 mt-1">
                  Examples: rtsp://192.168.1.100:554/stream, rtmp://server.com/live/stream, http://example.com/playlist.m3u8
                </p>
              </div>

              {/* Authentication */}
              <div className="space-y-4">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="useAuth"
                    checked={formData.config.useAuth}
                    onChange={e => setFormData({
                      ...formData,
                      config: { ...formData.config, useAuth: e.target.checked }
                    })}
                    className="mr-3"
                  />
                  <label htmlFor="useAuth" className="text-sm font-medium text-slate-300">
                    Requires Authentication
                  </label>
                </div>

                {formData.config.useAuth && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-6">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        Username
                      </label>
                      <input
                        type="text"
                        value={formData.config.username || ''}
                        onChange={e => setFormData({
                          ...formData,
                          config: { ...formData.config, username: e.target.value }
                        })}
                        className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-300 focus:outline-none focus:border-cyan-500"
                        placeholder="username"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        Password
                      </label>
                      <input
                        type="password"
                        value={formData.config.password || ''}
                        onChange={e => setFormData({
                          ...formData,
                          config: { ...formData.config, password: e.target.value }
                        })}
                        className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-300 focus:outline-none focus:border-cyan-500"
                        placeholder="password"
                      />
                    </div>
                  </div>
                )}
              </div>


              {/* Form Actions */}
              <div className="flex justify-end space-x-3 pt-4 border-t border-slate-700">
                <button
                  type="button"
                  onClick={resetForm}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                >
                  {editingStream ? 'Update Stream' : 'Add Stream'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Streams List */}
      <div className="space-y-4">
        {streams.length === 0 ? (
          <div className="text-center py-12 bg-slate-900/50 rounded-xl border border-slate-700/50">
            <div className="text-6xl mb-4">📹</div>
            <h3 className="text-lg font-medium text-slate-300 mb-2">No Streams Configured</h3>
            <p className="text-slate-400 mb-6">Add your first video stream to get started with horse tracking</p>
            <button
              onClick={() => setShowAddForm(true)}
              className="btn-primary"
            >
              Add Your First Stream
            </button>
          </div>
        ) : (
          streams.map(stream => (
            <div
              key={stream.id}
              className="bg-slate-900/50 backdrop-blur-sm rounded-xl border border-slate-700/50 p-6 hover:border-slate-600/50 transition-all duration-200"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="text-3xl">
                    {getStreamTypeIcon(stream.type)}
                  </div>
                  <div>
                    <h3 className="text-lg font-medium text-slate-100">{stream.name}</h3>
                    <p className="text-sm text-slate-400 font-mono">{stream.url}</p>
                    <div className="flex items-center space-x-4 mt-2">
                      <span className={`text-sm font-medium ${getStatusColor(stream.status)} flex items-center`}>
                        <div className={`w-2 h-2 rounded-full mr-2 ${
                          stream.status === 'active' ? 'bg-success animate-pulse' :
                          stream.status === 'processing' ? 'bg-amber-400 animate-pulse' :
                          stream.status === 'error' ? 'bg-error' : 'bg-slate-400'
                        }`} />
                        {stream.status.charAt(0).toUpperCase() + stream.status.slice(1)}
                      </span>
                      <span className="text-xs text-slate-500 uppercase font-medium">
                        {stream.type}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={async () => {
                      // If it's a local stream, control it via Stream Control API
                      if (stream.type === 'local' && stream.id.startsWith('stream_')) {
                        const isStarting = stream.status !== 'active';
                        console.log(`🔄 ${isStarting ? 'Starting' : 'Stopping'} local stream ${stream.id} via Stream Control API`);

                        try {
                          const endpoint = isStarting
                            ? `/api/streams/start/${stream.id}`
                            : `/api/streams/stop/${stream.id}`;

                          const response = await fetch(`http://localhost:8003${endpoint}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(isStarting ? { videoFilename: 'horse1.mp4' } : {})
                          });

                          if (response.ok) {
                            console.log(`✅ Local stream ${stream.id} ${isStarting ? 'started' : 'stopped'} successfully`);
                            updateStream(stream.id, {
                              status: isStarting ? 'active' : 'inactive'
                            });
                          } else {
                            console.warn(`⚠️ Failed to ${isStarting ? 'start' : 'stop'} local stream ${stream.id}:`, response.status);
                          }
                        } catch (error) {
                          console.warn(`⚠️ Network error ${isStarting ? 'starting' : 'stopping'} local stream ${stream.id}:`, error);
                        }
                      } else {
                        // For non-local streams, just update the status
                        updateStream(stream.id, {
                          status: stream.status === 'active' ? 'inactive' : 'active'
                        });
                      }
                    }}
                    className={`text-sm py-2 px-3 rounded-lg transition-colors ${
                      stream.status === 'active'
                        ? 'bg-success/20 text-success hover:bg-success/30'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {stream.status === 'active' ? '⏸️ Stop' : '▶️ Start'}
                  </button>
                  <button
                    onClick={() => handleEdit(stream)}
                    className="btn-secondary text-sm py-2 px-3"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleDelete(stream.id)}
                    className="btn-error text-sm py-2 px-3"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Stream Stats */}
              {stream.status === 'active' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 pt-4 border-t border-slate-700/50">
                  <div className="text-center">
                    <div className="text-xl font-bold text-cyan-400">{stream.horseCount || 0}</div>
                    <div className="text-xs text-slate-400">Horses Detected</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-bold text-success">{stream.accuracy || 0}%</div>
                    <div className="text-xs text-slate-400">Detection Accuracy</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-bold text-slate-300">{stream.lastUpdate || 'Never'}</div>
                    <div className="text-xs text-slate-400">Last Update</div>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};