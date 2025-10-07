import React, { useState, useEffect, useRef } from 'react';
import { VideoPlayer } from './VideoPlayer';
import { OverlayCanvas } from './OverlayCanvas';
import { useAppStore } from '../stores/useAppStore';

interface VideoChunk {
  id: string;
  filename: string;
  duration: number;
  status: 'recording' | 'completed' | 'failed';
  file_size: number;
  start_timestamp: string;
  end_timestamp: string;
  metadata: {
    codec?: string;
    resolution?: string;
    bitrate?: number;
    fps?: number;
  };
  created_at: string;
}

interface PrimaryVideoPlayerProps {
  stream: {
    id: string;
    name: string;
    url: string;
    status: 'active' | 'inactive' | 'processing' | 'error';
  };
  onClose?: () => void;
}

export const PrimaryVideoPlayer: React.FC<PrimaryVideoPlayerProps> = ({ stream, onClose }) => {
  const [viewMode, setViewMode] = useState<'live' | 'playback'>('live');
  const [selectedChunk, setSelectedChunk] = useState<VideoChunk | null>(null);
  const [videoChunks, setVideoChunks] = useState<VideoChunk[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(5);
  const [videoRef, setVideoRef] = useState<React.RefObject<HTMLVideoElement> | null>(null);
  const [showChunkNotification, setShowChunkNotification] = useState(false);

  // Load video chunks for this stream
  useEffect(() => {
    loadVideoChunks();
  }, [stream.id]);

  const getAuthToken = async () => {
    let token = localStorage.getItem('authToken');

    // Always try to refresh token to avoid 403 errors
    try {
      const response = await fetch('http://localhost:8000/api/v1/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'admin@barnhand.com',
          password: 'admin123'
        }),
      });

      if (response.ok) {
        const data = await response.json();
        token = data.accessToken;
        localStorage.setItem('authToken', token);
        console.log('Token refreshed successfully');
      } else {
        console.error('Failed to authenticate:', response.statusText);
        return null;
      }
    } catch (error) {
      console.error('Authentication error:', error);
      return null;
    }

    return token;
  };

  const loadVideoChunks = async () => {
    try {
      const token = await getAuthToken();
      if (!token) {
        console.error('No authentication token available');
        return;
      }

      const response = await fetch(`http://localhost:8000/api/v1/streams/${stream.id}/chunks`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setVideoChunks(data.chunks || []);
      } else {
        console.error('Failed to load video chunks:', response.statusText);
      }
    } catch (error) {
      console.error('Error loading video chunks:', error);
    }
  };

  const handleRecordChunk = async () => {
    if (isRecording) return;

    setIsRecording(true);
    try {
      const token = await getAuthToken();
      if (!token) {
        console.error('No authentication token available');
        setIsRecording(false);
        return;
      }

      const response = await fetch(`http://localhost:8000/api/v1/streams/${stream.id}/record-chunk`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ duration: recordingDuration }),
      });

      if (response.ok) {
        const data = await response.json();
        console.log('Recording started:', data);

        // Reload chunks after a delay to get the completed recording
        setTimeout(async () => {
          await loadVideoChunks();
          setIsRecording(false);

          // Show notification and auto-switch to playback
          console.log('Recording completed, switching to playback mode');
          setShowChunkNotification(true);
          setTimeout(() => setShowChunkNotification(false), 3000); // Hide after 3 seconds
          setViewMode('playback');

          // Wait a bit more for chunks to load, then select the latest
          setTimeout(async () => {
            // Reload chunks to get the latest data
            await loadVideoChunks();

            // Get the latest chunk after reload
            const updatedResponse = await fetch(`http://localhost:8000/api/v1/streams/${stream.id}/chunks`, {
              headers: {
                'Authorization': `Bearer ${await getAuthToken()}`,
                'Content-Type': 'application/json',
              },
            });

            if (updatedResponse.ok) {
              const updatedData = await updatedResponse.json();
              const latestChunk = updatedData.chunks?.[0]; // First item is newest

              if (latestChunk && latestChunk.status === 'completed') {
                console.log('Auto-playing latest chunk:', latestChunk.filename);
                await handleChunkSelect(latestChunk);
              }
            }
          }, 1000);
        }, (recordingDuration + 2) * 1000);
      } else {
        console.error('Failed to start recording:', response.statusText);
        setIsRecording(false);
      }
    } catch (error) {
      console.error('Error starting recording:', error);
      setIsRecording(false);
    }
  };

  const handleChunkSelect = async (chunk: VideoChunk) => {
    if (chunk.status !== 'completed') return;

    try {
      const token = await getAuthToken();
      if (!token) {
        console.error('No authentication token available');
        return;
      }

      const response = await fetch(`http://localhost:8000/api/v1/streams/${stream.id}/chunks/${chunk.id}/stream`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setSelectedChunk({
          ...chunk,
          streamUrl: data.streamUrl,
        } as VideoChunk & { streamUrl: string });
        setViewMode('playback');
      } else {
        console.error('Failed to get chunk stream URL:', response.statusText);
      }
    } catch (error) {
      console.error('Error getting chunk stream URL:', error);
    }
  };

  const handleBackToLive = () => {
    setViewMode('live');
    setSelectedChunk(null);
  };

  const handleSwitchToPlayback = async () => {
    setViewMode('playback');

    // Auto-select first chunk if available and none currently selected
    if (videoChunks.length > 0 && !selectedChunk) {
      const firstCompletedChunk = videoChunks.find(chunk => chunk.status === 'completed');
      if (firstCompletedChunk) {
        await handleChunkSelect(firstCompletedChunk);
      }
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const currentVideoUrl = viewMode === 'live'
    ? stream.url
    : (selectedChunk as VideoChunk & { streamUrl: string })?.streamUrl;

  return (
    <div className="primary-video-player space-y-4">
      {/* Header with Stream Name and Close Button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <h2 className="text-xl font-display font-bold text-slate-100">
            {stream.name}
          </h2>
          <div className={`px-2 py-1 rounded text-xs font-medium ${
            stream.status === 'active' ? 'bg-green-500/20 text-green-400' :
            stream.status === 'processing' ? 'bg-yellow-500/20 text-yellow-400' :
            stream.status === 'error' ? 'bg-red-500/20 text-red-400' :
            'bg-gray-500/20 text-gray-400'
          }`}>
            {stream.status.toUpperCase()}
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="flex items-center space-x-2 px-3 py-2 text-slate-400 hover:text-slate-300 hover:bg-slate-700/50 rounded-lg transition-all"
            title="Back to Dashboard"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span className="text-sm">Close</span>
          </button>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="flex space-x-1 bg-slate-800/50 border border-slate-700/50 rounded-lg p-1">
        <button
          onClick={handleBackToLive}
          className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            viewMode === 'live'
              ? 'bg-red-500/20 text-red-400 border border-red-500/30'
              : 'text-slate-400 hover:text-slate-300 hover:bg-slate-700/50'
          }`}
        >
          ● Live Stream
        </button>
        <button
          onClick={handleSwitchToPlayback}
          disabled={videoChunks.length === 0}
          className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            viewMode === 'playback'
              ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
              : videoChunks.length === 0
              ? 'text-slate-600 cursor-not-allowed'
              : 'text-slate-400 hover:text-slate-300 hover:bg-slate-700/50'
          }`}
        >
          ▶ Recorded Chunks ({videoChunks.length})
        </button>
      </div>

      {/* Main Video Display */}
      <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
        {(stream.status === 'active' && viewMode === 'live') || (viewMode === 'playback' && currentVideoUrl) ? (
          <>
            <VideoPlayer
              src={currentVideoUrl}
              streamId={stream.id}
              className="w-full h-full object-cover"
              onLoad={() => {}}
              onError={(error) => console.error('Video error:', error)}
              onVideoRef={setVideoRef}
            />
            {viewMode === 'live' && videoRef && videoRef.current && (
              <OverlayCanvas
                videoRef={videoRef}
                className="absolute inset-0 pointer-events-none"
                detections={[]}
              />
            )}

            {/* Video Mode Indicator */}
            <div className="absolute top-4 left-4">
              <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                viewMode === 'live'
                  ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                  : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
              }`}>
                {viewMode === 'live' ? '● LIVE' : '▶ PLAYBACK'}
              </div>
            </div>

            {/* Recording Indicator */}
            {isRecording && (
              <div className="absolute top-4 right-4 flex items-center space-x-2 px-3 py-1 bg-red-500/20 text-red-400 border border-red-500/30 rounded-full">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                <span className="text-xs font-medium">Recording {recordingDuration}s</span>
              </div>
            )}

            {/* New Chunk Notification */}
            {showChunkNotification && (
              <div className="absolute bottom-4 right-4 flex items-center space-x-2 px-4 py-2 bg-green-500/20 text-green-400 border border-green-500/30 rounded-lg animate-in slide-in-from-right-4 fade-in duration-300">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-sm font-medium">New chunk ready for playback!</span>
                <button
                  onClick={() => setShowChunkNotification(false)}
                  className="ml-2 text-green-400/70 hover:text-green-400 transition-colors"
                >
                  ×
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="flex items-center justify-center h-full bg-slate-900 text-slate-400">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-700/50 flex items-center justify-center">
                <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2 6a2 2 0 012-2h6l2 2h6a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM5 8a1 1 0 000 2h8a1 1 0 100-2H5z" />
                </svg>
              </div>
              <p className="text-sm">
                {viewMode === 'playback' ? 'None Available' : 'Stream Offline'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Live Mode Controls */}
      {stream.status === 'active' && viewMode === 'live' && (
        <div className="flex items-center justify-between p-4 bg-slate-800/50 border border-slate-700/50 rounded-lg">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <label className="text-sm text-slate-300">Duration:</label>
              <select
                value={recordingDuration}
                onChange={(e) => setRecordingDuration(Number(e.target.value))}
                className="px-2 py-1 bg-slate-700 border border-slate-600 rounded text-sm text-white"
                disabled={isRecording}
              >
                <option value={3}>3 seconds</option>
                <option value={5}>5 seconds</option>
                <option value={10}>10 seconds</option>
                <option value={15}>15 seconds</option>
                <option value={30}>30 seconds</option>
              </select>
            </div>
          </div>

          <button
            onClick={handleRecordChunk}
            disabled={isRecording}
            className={`px-6 py-2 rounded-lg font-medium text-sm transition-all ${
              isRecording
                ? 'bg-red-500/20 text-red-400 border border-red-500/30 cursor-not-allowed'
                : 'bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30'
            }`}
          >
            {isRecording ? 'Recording...' : `Process ${recordingDuration} Seconds`}
          </button>
        </div>
      )}

      {/* Playback Mode - Video Chunks List */}
      {viewMode === 'playback' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-white">Processed Video Chunks</h3>
          </div>

          {videoChunks.length > 0 ? (
            <div className="space-y-2 max-h-64 overflow-y-auto overflow-x-hidden">
              {videoChunks.map((chunk) => (
                <div
                  key={chunk.id}
                  onClick={() => handleChunkSelect(chunk)}
                  className={`p-3 border rounded-lg transition-all duration-200 cursor-pointer hover:scale-[1.02] w-full ${
                    chunk.status === 'completed'
                      ? selectedChunk?.id === chunk.id
                        ? 'bg-blue-500/20 border-blue-500/50 text-blue-300 shadow-lg shadow-blue-500/20'
                        : 'bg-slate-800/50 border-slate-700/50 text-slate-300 hover:bg-slate-700/50 hover:border-slate-600/50'
                      : 'bg-slate-800/30 border-slate-700/30 text-slate-500 cursor-not-allowed opacity-60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 w-full">
                    <div className="flex items-start space-x-3 min-w-0 flex-1">
                      <div className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${
                        chunk.status === 'completed' ? 'bg-green-500' :
                        chunk.status === 'recording' ? 'bg-yellow-500 animate-pulse' :
                        'bg-red-500'
                      }`}></div>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm truncate">{chunk.filename}</div>
                        <div className="text-xs opacity-75 whitespace-nowrap">
                          {formatDuration(chunk.duration)} • {formatFileSize(chunk.file_size)} • {new Date(chunk.created_at).toLocaleTimeString()}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 text-xs flex-shrink-0">
                      {chunk.metadata.resolution && (
                        <span className="px-2 py-1 bg-slate-700/50 rounded whitespace-nowrap">
                          {chunk.metadata.resolution}
                        </span>
                      )}
                      {selectedChunk?.id === chunk.id && (
                        <span className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded whitespace-nowrap">
                          Playing
                        </span>
                      )}
                      <span className={`px-2 py-1 rounded whitespace-nowrap ${
                        chunk.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                        chunk.status === 'recording' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-red-500/20 text-red-400'
                      }`}>
                        {chunk.status}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-32 bg-slate-800/30 border border-slate-700/30 rounded-lg">
              <div className="text-center text-slate-500">
                <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-slate-700/50 flex items-center justify-center">
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                    <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                  </svg>
                </div>
                <p className="text-sm">No recorded chunks yet</p>
                <p className="text-xs opacity-75">Switch to Live tab to record video chunks</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};