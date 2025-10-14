import React, { useState, useEffect, useRef } from 'react';

import { DetectionDataPanel } from './DetectionDataPanel';
import { OverlayCanvas } from './OverlayCanvas';
import { VideoPlayer } from './VideoPlayer';

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
  ml_processed?: boolean;
  processing_status?:
    | 'pending'
    | 'queued'
    | 'processing'
    | 'complete'
    | 'failed'
    | 'timeout';
  isProcessed?: boolean;
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

export const PrimaryVideoPlayer: React.FC<PrimaryVideoPlayerProps> = ({
  stream,
  onClose,
}) => {
  const [viewMode, setViewMode] = useState<'live' | 'playback'>('live');
  const [selectedChunk, setSelectedChunk] = useState<VideoChunk | null>(null);
  const [videoChunks, setVideoChunks] = useState<VideoChunk[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(5);
  const [frameInterval, setFrameInterval] = useState(1);
  const [videoRef, setVideoRef] =
    useState<React.RefObject<HTMLVideoElement> | null>(null);
  const [showChunkNotification, setShowChunkNotification] = useState(false);
  const [showRawVideo, setShowRawVideo] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string | null>(null);
  const [processingProgress, setProcessingProgress] = useState<{
    frames_processed: number;
    total_frames: number;
  } | null>(null);
  const [detectionDataKey, setDetectionDataKey] = useState(0);

  // Load video chunks for this stream
  useEffect(() => {
    loadVideoChunks();
  }, [stream.id]);

  // Reload video when raw toggle changes
  useEffect(() => {
    if (selectedChunk && viewMode === 'playback') {
      handleChunkSelect(selectedChunk);
    }
  }, [showRawVideo]);

  // Track previous status using ref so it persists across renders
  const prevStatusRef = useRef<string | null>(null);

  // Poll chunk processing status when a chunk is selected
  useEffect(() => {
    if (!selectedChunk) return;

    // Reset previous status when chunk changes
    prevStatusRef.current = null;

    const pollStatus = async () => {
      try {
        const token = await getAuthToken();
        if (!token) return;

        const response = await fetch(
          `http://localhost:8000/api/v1/streams/${stream.id}/chunks/${selectedChunk.id}/status`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          const currentStatus = data.processing_status || 'pending';

          console.log('📊 Chunk status poll:', {
            chunk_id: selectedChunk.id,
            status: currentStatus,
            frames_processed: data.frames_processed,
            total_frames: data.total_frames,
            has_processed_video: data.has_processed_video,
            has_detections: data.has_detections,
            raw_response: data,
          });

          setProcessingStatus(currentStatus);

          // Update progress if available
          if (
            data.frames_processed !== undefined &&
            data.total_frames !== undefined
          ) {
            console.log('✅ Setting progress:', {
              frames_processed: data.frames_processed,
              total_frames: data.total_frames,
            });
            setProcessingProgress({
              frames_processed: data.frames_processed,
              total_frames: data.total_frames,
            });
          } else {
            console.log('⚠️ No progress data available');
            setProcessingProgress(null);
          }

          // If processing just completed, auto-switch to processed video and refresh data
          console.log('🔍 Status transition check:', {
            prevStatus: prevStatusRef.current,
            currentStatus: currentStatus,
            willAutoSwitch:
              prevStatusRef.current === 'processing' &&
              currentStatus === 'complete',
          });

          if (
            prevStatusRef.current === 'processing' &&
            currentStatus === 'complete'
          ) {
            console.log(
              '✅ ML processing completed! Auto-switching to processed video...'
            );
            console.log('🔄 Current state:', {
              showRawVideo,
              selectedChunk: selectedChunk?.id,
              detectionDataKey,
            });

            // Force switch to processed video (will trigger useEffect to reload)
            setShowRawVideo(false);

            // Trigger detection data refresh
            setDetectionDataKey(prev => prev + 1);

            // Clear progress
            setProcessingProgress(null);

            // Force reload the chunk to get the processed version
            if (selectedChunk) {
              console.log('🔄 Reloading chunk to get processed video...');
              setTimeout(() => {
                handleChunkSelect(selectedChunk);
              }, 500);
            }

            console.log('✅ Auto-switch triggered!');
          }

          // Update ref for next comparison
          prevStatusRef.current = currentStatus;
        }
      } catch (error) {
        console.error('Error polling processing status:', error);
      }
    };

    // Initial fetch
    pollStatus();

    // Poll every 2 seconds
    const intervalId = setInterval(pollStatus, 2000);

    // Cleanup on unmount or chunk change
    return () => {
      clearInterval(intervalId);
    };
  }, [selectedChunk, stream.id, showRawVideo]);

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
          password: 'admin123',
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

      const response = await fetch(
        `http://localhost:8000/api/v1/streams/${stream.id}/chunks`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

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

      const response = await fetch(
        `http://localhost:8000/api/v1/streams/${stream.id}/record-chunk`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            duration: recordingDuration,
            frame_interval: frameInterval,
          }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        console.log('Recording started:', data);

        // Reload chunks after a delay to get the completed recording
        setTimeout(
          async () => {
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
              const updatedResponse = await fetch(
                `http://localhost:8000/api/v1/streams/${stream.id}/chunks`,
                {
                  headers: {
                    Authorization: `Bearer ${await getAuthToken()}`,
                    'Content-Type': 'application/json',
                  },
                }
              );

              if (updatedResponse.ok) {
                const updatedData = await updatedResponse.json();
                const latestChunk = updatedData.chunks?.[0]; // First item is newest

                if (latestChunk && latestChunk.status === 'completed') {
                  console.log(
                    'Auto-playing latest chunk:',
                    latestChunk.filename
                  );
                  await handleChunkSelect(latestChunk);
                }
              }
            }, 1000);
          },
          (recordingDuration + 2) * 1000
        );
      } else {
        console.error('Failed to start recording:', response.statusText);
        setIsRecording(false);
      }
    } catch (error) {
      console.error('Error starting recording:', error);
      setIsRecording(false);
    }
  };

  const fetchProcessingStatus = async (chunkId: string) => {
    try {
      const token = await getAuthToken();
      if (!token) return;

      const response = await fetch(
        `http://localhost:8000/api/v1/streams/${stream.id}/chunks/${chunkId}/status`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setProcessingStatus(data.processing_status || 'pending');
      }
    } catch (error) {
      console.error('Error fetching processing status:', error);
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

      // Build URL with raw parameter if needed
      const url = new URL(
        `http://localhost:8000/api/v1/streams/${stream.id}/chunks/${chunk.id}/stream`
      );
      if (showRawVideo) {
        url.searchParams.append('raw', 'true');
      }

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setSelectedChunk({
          ...chunk,
          streamUrl: data.streamUrl,
          isProcessed: data.isProcessed,
        } as VideoChunk & { streamUrl: string });
        setViewMode('playback');

        // Fetch processing status
        fetchProcessingStatus(chunk.id);
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
      const firstCompletedChunk = videoChunks.find(
        chunk => chunk.status === 'completed'
      );
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

  const currentVideoUrl =
    viewMode === 'live'
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
          <div
            className={`px-2 py-1 rounded text-xs font-medium ${
              stream.status === 'active'
                ? 'bg-green-500/20 text-green-400'
                : stream.status === 'processing'
                  ? 'bg-yellow-500/20 text-yellow-400'
                  : stream.status === 'error'
                    ? 'bg-red-500/20 text-red-400'
                    : 'bg-gray-500/20 text-gray-400'
            }`}
          >
            {stream.status.toUpperCase()}
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="flex items-center space-x-2 px-3 py-2 text-slate-400 hover:text-slate-300 hover:bg-slate-700/50 rounded-lg transition-all"
            title="Back to Dashboard"
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
                d="M6 18L18 6M6 6l12 12"
              />
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
        {(stream.status === 'active' && viewMode === 'live') ||
        (viewMode === 'playback' && currentVideoUrl) ? (
          <>
            <VideoPlayer
              key={`${selectedChunk?.id || 'live'}-${showRawVideo ? 'raw' : 'processed'}`}
              src={currentVideoUrl}
              streamId={stream.id}
              className="w-full h-full object-cover"
              onLoad={() => {}}
              onError={error => console.error('Video error:', error)}
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
            <div className="absolute top-4 left-4 flex flex-col gap-2">
              <div
                className={`px-3 py-1 rounded-full text-xs font-medium ${
                  viewMode === 'live'
                    ? 'bg-red-600 text-white'
                    : 'bg-blue-600 text-white'
                }`}
              >
                {viewMode === 'live' ? '● LIVE' : '▶ PLAYBACK'}
              </div>

              {/* Processing Status Badge (only in playback mode) */}
              {viewMode === 'playback' && processingStatus && (
                <div
                  className={`px-3 py-1 rounded-full text-xs font-medium ${
                    processingStatus === 'complete'
                      ? 'bg-green-600 text-white'
                      : processingStatus === 'processing'
                        ? 'bg-yellow-600 text-white'
                        : processingStatus === 'failed' ||
                            processingStatus === 'timeout'
                          ? 'bg-red-600 text-white'
                          : 'bg-slate-600 text-white'
                  }`}
                >
                  {processingStatus === 'complete'
                    ? '✓ Processed'
                    : processingStatus === 'processing'
                      ? processingProgress
                        ? `🔄 Processing: ${processingProgress.frames_processed}/${processingProgress.total_frames} frames`
                        : '🔄 Processing...'
                      : processingStatus === 'failed'
                        ? '✗ Failed'
                        : processingStatus === 'timeout'
                          ? '⏱ Timeout'
                          : '○ Pending'}
                </div>
              )}
            </div>

            {/* Recording Indicator */}
            {isRecording && (
              <div className="absolute top-4 right-4 flex items-center space-x-2 px-3 py-1 bg-red-600 text-white rounded-full">
                <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                <span className="text-xs font-medium">
                  Recording {recordingDuration}s
                </span>
              </div>
            )}

            {/* Raw Video Toggle (only in playback mode) */}
            {viewMode === 'playback' && (
              <div className="absolute bottom-4 right-4">
                <button
                  onClick={() => setShowRawVideo(!showRawVideo)}
                  className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                    showRawVideo
                      ? 'bg-orange-600 text-white'
                      : 'bg-slate-700 text-white hover:bg-slate-600'
                  }`}
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
                      d={
                        showRawVideo
                          ? 'M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z'
                          : 'M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21'
                      }
                    />
                  </svg>
                  <span>{showRawVideo ? 'Show Processed' : 'Show Raw'}</span>
                </button>
              </div>
            )}

            {/* New Chunk Notification */}
            {showChunkNotification && (
              <div className="absolute bottom-4 left-4 flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg animate-in slide-in-from-left-4 fade-in duration-300">
                <div className="w-2 h-2 bg-white rounded-full"></div>
                <span className="text-sm font-medium">
                  New chunk ready for playback!
                </span>
                <button
                  onClick={() => setShowChunkNotification(false)}
                  className="ml-2 text-white/70 hover:text-white transition-colors"
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
                <svg
                  className="w-8 h-8"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
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
                onChange={e => setRecordingDuration(Number(e.target.value))}
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

            <div className="flex items-center space-x-2">
              <label
                className="text-sm text-slate-300"
                title="Process every Nth frame (1 = all frames, 2 = every other frame, etc.)"
              >
                Frame Interval:
              </label>
              <input
                type="number"
                min="1"
                max="300"
                value={frameInterval}
                onChange={e =>
                  setFrameInterval(
                    Math.max(1, Math.min(300, Number(e.target.value)))
                  )
                }
                className="w-16 px-2 py-1 bg-slate-700 border border-slate-600 rounded text-sm text-white text-center"
                disabled={isRecording}
              />
              <span className="text-xs text-slate-400">(1-300)</span>
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
            {isRecording
              ? 'Recording...'
              : `Process ${recordingDuration} Seconds`}
          </button>
        </div>
      )}

      {/* Playback Mode - Video Chunks List and Detection Panel */}
      {viewMode === 'playback' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left Column: Video Chunks List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-white">
                Processed Video Chunks
              </h3>
            </div>

            {videoChunks.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-y-auto overflow-x-hidden">
                {videoChunks.map(chunk => (
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
                        <div
                          className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${
                            chunk.status === 'completed'
                              ? 'bg-green-500'
                              : chunk.status === 'recording'
                                ? 'bg-yellow-500 animate-pulse'
                                : 'bg-red-500'
                          }`}
                        ></div>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-sm truncate">
                            {chunk.filename}
                          </div>
                          <div className="text-xs opacity-75 whitespace-nowrap">
                            {formatDuration(chunk.duration)} •{' '}
                            {formatFileSize(chunk.file_size)} •{' '}
                            {new Date(chunk.created_at).toLocaleTimeString()}
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
                        <span
                          className={`px-2 py-1 rounded whitespace-nowrap ${
                            chunk.status === 'completed'
                              ? 'bg-green-500/20 text-green-400'
                              : chunk.status === 'recording'
                                ? 'bg-yellow-500/20 text-yellow-400'
                                : 'bg-red-500/20 text-red-400'
                          }`}
                        >
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
                    <svg
                      className="w-6 h-6"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                      <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                    </svg>
                  </div>
                  <p className="text-sm">No recorded chunks yet</p>
                  <p className="text-xs opacity-75">
                    Switch to Live tab to record video chunks
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Detection Data Panel */}
          <div className="detection-panel-container">
            <DetectionDataPanel
              key={detectionDataKey}
              streamId={stream.id}
              chunkId={selectedChunk?.id || null}
            />
          </div>
        </div>
      )}
    </div>
  );
};
