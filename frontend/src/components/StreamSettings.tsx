import React, { useState, useEffect } from 'react';

import { useAppStore, useStreams } from '../stores/useAppStore';

interface StreamFormData {
  name: string;
  url: string;
  type: 'local' | 'rtsp' | 'rtmp' | 'http';
  config: {
    username?: string;
    password?: string;
    useAuth?: boolean;
    // PTZ camera credentials (for web interface on port 8080)
    ptzCredentials?: {
      username: string;
      password: string;
    };
    // PTZ presets (saved camera positions)
    ptzPresets?: {
      [presetNumber: string]: {
        name: string;
        savedAt: string;
      };
    };
    // Auto-scan settings
    autoScan?: {
      movementDelay: number; // Time for camera to physically move (seconds)
      hlsDelay: number; // HLS pipeline delay (seconds)
      recordingDuration: number; // Recording duration per location (seconds)
    };
  };
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

export const StreamSettings: React.FC = () => {
  const streams = useStreams();
  const { updateStream, removeStream, setStreams } = useAppStore();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingStream, setEditingStream] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_loadingStreams, setLoadingStreams] = useState(true);
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
        ptzCredentials: undefined,
        autoScan: {
          movementDelay: 5,
          hlsDelay: 6,
          recordingDuration: 10,
        },
      },
    });
    setShowAddForm(false);
    setEditingStream(null);
  };

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
    } catch (error) {
      console.error('Auto-login failed:', error);
    }
    return null;
  };

  // Load streams from database and sync with video-streamer status
  useEffect(() => {
    const loadStreamsFromDatabase = async () => {
      try {
        // Get valid token (will auto-refresh if expired)
        const token = await getAuthToken();
        if (!token) {
          console.warn('No auth token - skipping stream load');
          setLoadingStreams(false);
          return;
        }

        // Fetch both database streams and video-streamer status in parallel
        const [dbResponse, videoStreamerResponse] = await Promise.all([
          fetch('http://localhost:8000/api/v1/streams', {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }),
          fetch('http://localhost:8003/api/streams').catch(() => null),
        ]);

        if (dbResponse.ok) {
          const dbData = await dbResponse.json();
          console.log('✅ Loaded streams from database:', dbData.streams);

          // Get video-streamer active stream IDs
          const activeStreamIds = new Set<string>();
          if (videoStreamerResponse?.ok) {
            const vsData = await videoStreamerResponse.json();
            vsData.streams?.forEach((s: { id: string; status: string }) => {
              if (s.status === 'active') {
                activeStreamIds.add(s.id);
              }
            });
            console.log('✅ Video-streamer active streams:', Array.from(activeStreamIds));
          }

          // Map database streams to Zustand format, using video-streamer status as truth
          const mappedStreams = dbData.streams.map((dbStream: any) => ({
            id: dbStream.id,
            name: dbStream.name,
            url: dbStream.source_url,
            type: dbStream.source_type,
            // Use video-streamer status if available, otherwise use database status
            status: activeStreamIds.has(dbStream.id) ? 'active' :
                    (activeStreamIds.size > 0 ? 'inactive' : dbStream.status),
            config: dbStream.config || {},
          }));

          // Replace Zustand streams with database streams
          setStreams(mappedStreams);
        } else {
          console.error('❌ Failed to load streams:', dbResponse.status);
        }
      } catch (error) {
        console.error('❌ Error loading streams:', error);
      } finally {
        setLoadingStreams(false);
      }
    };

    loadStreamsFromDatabase();

    // Refresh status every 10 seconds to stay in sync with video-streamer
    const interval = setInterval(loadStreamsFromDatabase, 10000);
    return () => clearInterval(interval);
  }, []); // Run once on mount

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const token = await getAuthToken();
    if (!token) {
      alert('Authentication required - please log in');
      return;
    }

    if (editingStream) {
      // Update existing stream - persist to database via API
      try {
        const streamData = {
          name: formData.name,
          source_url: formData.url,
          source_type: formData.type,
          config: formData.config,
        };

        console.log('🔄 Updating stream via API:', editingStream, streamData);
        const response = await fetch(`http://localhost:8000/api/v1/streams/${editingStream}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(streamData),
        });

        if (response.ok) {
          const result = await response.json();
          console.log('✅ Stream updated successfully:', result);
          // Update Zustand store with mapped field names
          updateStream(editingStream, {
            name: formData.name,
            url: formData.url,
            type: formData.type,
            config: formData.config,
          });
        } else {
          console.error('❌ Failed to update stream:', response.status);
          const errorData = await response.json().catch(() => ({ error: response.statusText }));
          alert(`Failed to update stream: ${errorData.error || response.statusText}`);
          return; // Don't reset form on error
        }
      } catch (error) {
        console.error('❌ Network error updating stream:', error);
        alert('Network error - could not update stream');
        return; // Don't reset form on error
      }
    } else {
      // Create new stream - persist to database via API
      try {
        // Decode JWT to get farmId
        const decoded = decodeJWT(token);
        if (!decoded || !decoded.farmId) {
          alert('Invalid authentication token - please log in again');
          return;
        }

        const streamData = {
          farm_id: decoded.farmId,
          name: formData.name,
          source_url: formData.url,
          source_type: formData.type,
          processing_delay: 20,
          chunk_duration: 10,
          config: formData.config,
        };

        console.log('➕ Creating new stream via API:', streamData);
        const response = await fetch('http://localhost:8000/api/v1/streams', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(streamData),
        });

        if (response.ok) {
          const result = await response.json();
          console.log('✅ Stream created successfully:', result);

          // Add to Zustand store with the server-generated ID
          const newStream = {
            id: result.id,
            name: formData.name,
            url: formData.url,
            type: formData.type,
            status: result.status || 'inactive',
            config: formData.config,
          };

          // Use addStreamWithId to add with the server ID
          useAppStore.getState().addStreamWithId(result.id, newStream);
        } else {
          console.error('❌ Failed to create stream:', response.status);
          const errorData = await response.json().catch(() => ({ error: response.statusText }));
          alert(`Failed to create stream: ${errorData.error || response.statusText}`);
          return; // Don't reset form on error
        }
      } catch (error) {
        console.error('❌ Network error creating stream:', error);
        alert('Network error - could not create stream');
        return; // Don't reset form on error
      }
    }

    resetForm();
  };

  const handleEdit = (stream: any) => {
    const config = stream.config || {};
    setFormData({
      name: stream.name,
      url: stream.url,
      type: stream.type,
      config: {
        username: config.username || '',
        password: config.password || '',
        useAuth: config.useAuth || false,
        ptzCredentials: config.ptzCredentials,
        ptzPresets: config.ptzPresets,
        autoScan: config.autoScan || {
          movementDelay: 5,
          hlsDelay: 6,
          recordingDuration: 10,
        },
      },
    });
    setEditingStream(stream.id);
    setShowAddForm(true);
  };

  const handleDelete = async (streamId: string) => {
    if (confirm('Are you sure you want to delete this stream?')) {
      // Stop the stream in video-streamer first
      console.log(`🔄 Stopping stream ${streamId} in video-streamer`);
      try {
        await fetch(`http://localhost:8003/api/streams/stop/${streamId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });
        console.log(`✅ Stream ${streamId} stopped in video-streamer`);
      } catch (error) {
        console.warn(`⚠️ Could not stop stream in video-streamer:`, error);
      }

      // Delete from database
      const token = await getAuthToken();
      if (token) {
        try {
          const response = await fetch(`http://localhost:8000/api/v1/streams/${streamId}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          });

          if (response.ok) {
            console.log(`✅ Stream ${streamId} deleted from database`);
          } else {
            const errorData = await response.json().catch(() => ({}));
            console.error(`❌ Failed to delete stream from database:`, errorData);
            alert(`Failed to delete stream: ${errorData.error || response.statusText}`);
            return; // Don't remove from local store if database delete failed
          }
        } catch (error) {
          console.error(`❌ Network error deleting stream:`, error);
          alert('Network error - could not delete stream');
          return;
        }
      }

      // Remove from local Zustand store
      removeStream(streamId);
      console.log(`✅ Stream ${streamId} removed from local store`);
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

              {/* PTZ Camera Credentials (for RTSP streams) */}
              {formData.type === 'rtsp' && (
                <div className="space-y-4 p-4 bg-slate-800/50 rounded-lg border border-slate-600/50">
                  <div>
                    <h4 className="text-sm font-medium text-slate-200 flex items-center">
                      <span className="mr-2">🎮</span>
                      PTZ Camera Credentials
                    </h4>
                    <p className="text-xs text-slate-400 mt-1">
                      Credentials for the camera's web interface (port 8080) used for PTZ control and snapshots
                    </p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        PTZ Username
                      </label>
                      <input
                        type="text"
                        value={formData.config.ptzCredentials?.username || ''}
                        onChange={e => setFormData({
                          ...formData,
                          config: {
                            ...formData.config,
                            ptzCredentials: {
                              username: e.target.value,
                              password: formData.config.ptzCredentials?.password || '',
                            }
                          }
                        })}
                        className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-300 focus:outline-none focus:border-cyan-500"
                        placeholder="admin"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        PTZ Password
                      </label>
                      <input
                        type="password"
                        value={formData.config.ptzCredentials?.password || ''}
                        onChange={e => setFormData({
                          ...formData,
                          config: {
                            ...formData.config,
                            ptzCredentials: {
                              username: formData.config.ptzCredentials?.username || '',
                              password: e.target.value,
                            }
                          }
                        })}
                        className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-300 focus:outline-none focus:border-cyan-500"
                        placeholder="password"
                      />
                    </div>
                  </div>

                  {/* Show saved PTZ presets (read-only info) */}
                  {formData.config.ptzPresets && Object.keys(formData.config.ptzPresets).length > 0 && (
                    <div className="mt-4 pt-4 border-t border-slate-600/50">
                      <h5 className="text-sm font-medium text-slate-300 mb-2">
                        Saved Presets ({Object.keys(formData.config.ptzPresets).length})
                      </h5>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(formData.config.ptzPresets)
                          .sort(([a], [b]) => parseInt(a) - parseInt(b))
                          .map(([num, preset]) => (
                            <span
                              key={num}
                              className="px-2 py-1 bg-slate-700 rounded text-xs text-slate-300"
                              title={`Saved: ${new Date(preset.savedAt).toLocaleString()}`}
                            >
                              #{num} {preset.name}
                            </span>
                          ))}
                      </div>
                      <p className="text-xs text-slate-500 mt-2">
                        Presets are saved via PTZ Controls when viewing the stream
                      </p>
                    </div>
                  )}

                  {/* Auto-Scan Settings */}
                  <div className="mt-4 pt-4 border-t border-slate-600/50">
                    <h5 className="text-sm font-medium text-slate-200 mb-3 flex items-center">
                      <span className="mr-2">⏱️</span>
                      Auto-Scan Timing Settings
                    </h5>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                          Movement Delay (sec)
                        </label>
                        <input
                          type="number"
                          min="2"
                          max="15"
                          value={formData.config.autoScan?.movementDelay ?? 5}
                          onChange={e => setFormData({
                            ...formData,
                            config: {
                              ...formData.config,
                              autoScan: {
                                ...formData.config.autoScan,
                                movementDelay: parseInt(e.target.value) || 5,
                                hlsDelay: formData.config.autoScan?.hlsDelay ?? 6,
                                recordingDuration: formData.config.autoScan?.recordingDuration ?? 10,
                              }
                            }
                          })}
                          className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-300 focus:outline-none focus:border-cyan-500"
                        />
                        <p className="text-xs text-slate-500 mt-1">
                          Time for camera to physically move
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                          HLS Delay (sec)
                        </label>
                        <input
                          type="number"
                          min="3"
                          max="20"
                          value={formData.config.autoScan?.hlsDelay ?? 6}
                          onChange={e => setFormData({
                            ...formData,
                            config: {
                              ...formData.config,
                              autoScan: {
                                ...formData.config.autoScan,
                                movementDelay: formData.config.autoScan?.movementDelay ?? 5,
                                hlsDelay: parseInt(e.target.value) || 6,
                                recordingDuration: formData.config.autoScan?.recordingDuration ?? 10,
                              }
                            }
                          })}
                          className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-300 focus:outline-none focus:border-cyan-500"
                        />
                        <p className="text-xs text-slate-500 mt-1">
                          HLS pipeline delay
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-2">
                          Recording Duration (sec)
                        </label>
                        <input
                          type="number"
                          min="5"
                          max="30"
                          value={formData.config.autoScan?.recordingDuration ?? 10}
                          onChange={e => setFormData({
                            ...formData,
                            config: {
                              ...formData.config,
                              autoScan: {
                                ...formData.config.autoScan,
                                movementDelay: formData.config.autoScan?.movementDelay ?? 5,
                                hlsDelay: formData.config.autoScan?.hlsDelay ?? 6,
                                recordingDuration: parseInt(e.target.value) || 10,
                              }
                            }
                          })}
                          className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-slate-300 focus:outline-none focus:border-cyan-500"
                        />
                        <p className="text-xs text-slate-500 mt-1">
                          Recording time per location
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

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
                      const isStarting = stream.status !== 'active';
                      console.log(`🔄 ${isStarting ? 'Starting' : 'Stopping'} stream ${stream.id} (${stream.type})`);

                      try {
                        const endpoint = isStarting
                          ? `/api/streams/start/${stream.id}`
                          : `/api/streams/stop/${stream.id}`;

                        // Prepare request body based on stream type
                        let requestBody = {};
                        if (isStarting) {
                          if (stream.type === 'local') {
                            requestBody = { videoFilename: 'horse1.mp4' };
                          } else {
                            // RTSP, RTMP, HTTP streams
                            requestBody = {
                              sourceUrl: stream.url,
                              sourceType: stream.type
                            };
                          }
                        }

                        const response = await fetch(`http://localhost:8003${endpoint}`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify(requestBody)
                        });

                        if (response.ok) {
                          console.log(`✅ Stream ${stream.id} ${isStarting ? 'started' : 'stopped'} successfully`);
                          const newStatus = isStarting ? 'active' : 'inactive';

                          // Update local Zustand store
                          updateStream(stream.id, { status: newStatus });

                          // Also sync database status
                          const token = await getAuthToken();
                          if (token) {
                            fetch(`http://localhost:8000/api/v1/streams/${stream.id}`, {
                              method: 'PUT',
                              headers: {
                                'Authorization': `Bearer ${token}`,
                                'Content-Type': 'application/json',
                              },
                              body: JSON.stringify({ status: newStatus }),
                            }).catch(err => console.warn('Failed to sync database status:', err));
                          }
                        } else {
                          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                          console.error(`❌ Failed to ${isStarting ? 'start' : 'stop'} stream ${stream.id}:`, errorData);
                          alert(`Failed to ${isStarting ? 'start' : 'stop'} stream: ${errorData.error || response.statusText}`);
                        }
                      } catch (error) {
                        console.error(`❌ Network error ${isStarting ? 'starting' : 'stopping'} stream ${stream.id}:`, error);
                        alert(`Network error - could not ${isStarting ? 'start' : 'stop'} stream`);
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