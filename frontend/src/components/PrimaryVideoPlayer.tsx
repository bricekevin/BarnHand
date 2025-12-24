import React, { useState, useEffect, useRef } from 'react';

import { AutoScanDialog } from './AutoScanDialog';
import { DetectedHorsesTab } from './DetectedHorsesTab';
import { DetectionDataPanel } from './DetectionDataPanel';
import { OverlayCanvas } from './OverlayCanvas';
import { PTZControls } from './PTZControls';
import { VideoPlayer } from './VideoPlayer';
import { useAppStore, useStreamHorses, useStreams } from '../stores/useAppStore';

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
  correction_count?: number;
  last_corrected?: string;
  thumbnail_url?: string;
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
  // Get horses from Zustand store
  const streamHorses = useStreamHorses(stream.id);
  const setStreamHorses = useAppStore(state => state.setStreamHorses);

  // Get stream config and source URL for PTZ control
  const streams = useStreams();
  const setStreams = useAppStore(state => state.setStreams);
  const dbStream = streams.find(s => s.id === stream.id);
  const streamConfig = dbStream?.config;
  const sourceUrl = dbStream?.url; // This is the RTSP source URL from database

  const [viewMode, setViewMode] = useState<'live' | 'playback' | 'horses'>(
    'live'
  );
  const [selectedChunk, setSelectedChunk] = useState<VideoChunk | null>(null);
  const [videoChunks, setVideoChunks] = useState<VideoChunk[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(5);
  const [frameInterval, setFrameInterval] = useState(1);
  const [videoRef, setVideoRef] =
    useState<React.RefObject<HTMLVideoElement> | null>(null);
  const [showChunkNotification, setShowChunkNotification] = useState(false);
  const [showRawVideo, setShowRawVideo] = useState(false);
  const [videoReloadKey, setVideoReloadKey] = useState(0);
  const [processingStatus, setProcessingStatus] = useState<string | null>(null);
  const [processingProgress, setProcessingProgress] = useState<{
    frames_processed: number;
    total_frames: number;
  } | null>(null);
  const [detectionDataKey, setDetectionDataKey] = useState(0);
  const [showUpdateNotification, setShowUpdateNotification] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState('Corrections successfully submitted');

  // Auto-scan state
  const [isAutoScanning, setIsAutoScanning] = useState(false);
  const [showAutoScanDialog, setShowAutoScanDialog] = useState(false);

  // Load video chunks for this stream
  useEffect(() => {
    loadVideoChunks();
  }, [stream.id]);

  // Function to reload streams from database (used after PTZ preset changes)
  const reloadStreamsFromDatabase = async () => {
    try {
      const token = await getAuthToken();
      if (!token) return;

      const response = await fetch('http://localhost:8000/api/v1/streams', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        const mappedStreams = data.streams.map((dbStream: any) => ({
          id: dbStream.id,
          name: dbStream.name,
          url: dbStream.source_url,
          type: dbStream.source_type,
          status: dbStream.status,
          config: dbStream.config || {},
        }));
        setStreams(mappedStreams);
        console.log('✅ Reloaded streams with updated config:', mappedStreams);
      }
    } catch (error) {
      console.error('Error reloading streams:', error);
    }
  };

  // Load streams from database if not already in Zustand (needed for PTZ source URL)
  useEffect(() => {
    const loadStreamsFromDatabase = async () => {
      // Skip if we already have streams with source URLs
      if (streams.length > 0 && streams.some(s => s.url?.startsWith('rtsp://'))) {
        return;
      }
      await reloadStreamsFromDatabase();
    };

    loadStreamsFromDatabase();
  }, [streams.length, setStreams]);

  // Load horses for this stream to populate the tab count
  useEffect(() => {
    const fetchHorses = async () => {
      try {
        const token = await getAuthToken();
        if (!token) return;

        const response = await fetch(
          `http://localhost:8000/api/v1/streams/${stream.id}/horses`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          setStreamHorses(stream.id, data.horses || []);
        }
      } catch (err) {
        console.error('Error fetching horses for tab count:', err);
      }
    };

    fetchHorses();
  }, [stream.id, setStreamHorses]);

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

          // Auto-switch to raw video when processing starts
          if (
            (prevStatusRef.current === 'pending' || prevStatusRef.current === null) &&
            currentStatus === 'processing' &&
            !showRawVideo
          ) {
            console.log(
              '▶️ ML processing started! Auto-switching to raw video...'
            );
            setShowRawVideo(true);
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

    // Only poll if there's a selected chunk and we're in playback mode
    if (!selectedChunk || viewMode !== 'playback') {
      return;
    }

    // Initial fetch
    pollStatus();

    // Poll every 5 seconds (reduced from 2s to reduce API load)
    // Stop polling once chunk reaches a terminal state (complete, failed, error)
    const intervalId = setInterval(async () => {
      await pollStatus();

      // Stop polling if we reached a terminal state (use ref for current value)
      const terminalStates = ['complete', 'failed', 'error'];
      const currentStatus = prevStatusRef.current;
      if (currentStatus && terminalStates.includes(currentStatus)) {
        console.log(`⏸️ Stopping status polling - chunk is ${currentStatus}`);
        clearInterval(intervalId);
      }
    }, 5000);

    // Cleanup on unmount or chunk change
    return () => {
      clearInterval(intervalId);
    };
  }, [selectedChunk, stream.id, viewMode]); // Removed showRawVideo and processingStatus to prevent re-creating interval

  // Listen for correction events (Task 3.2)
  useEffect(() => {
    // Handle when corrections are submitted (show immediate feedback)
    const handleCorrectionsSubmitted = (event: Event) => {
      const customEvent = event as CustomEvent<{
        chunkId: string;
        correctionsCount: number;
      }>;
      const { chunkId } = customEvent.detail;

      // Only show notification if this is the currently selected chunk
      if (selectedChunk && selectedChunk.id === chunkId) {
        console.log('[PrimaryVideoPlayer] Corrections submitted, showing notification...');
        setNotificationMessage('Corrections successfully submitted');
        setShowUpdateNotification(true);

        // Hide after 3 seconds (will be replaced if chunk:updated comes sooner)
        setTimeout(() => {
          setShowUpdateNotification(false);
        }, 3000);
      }
    };

    // Handle when chunk processing is complete (reload video)
    const handleChunkUpdate = async (event: Event) => {
      const customEvent = event as CustomEvent<{
        chunkId: string;
        message: string;
      }>;
      const { chunkId } = customEvent.detail;

      console.log(
        `[PrimaryVideoPlayer] Received chunk:updated event for ${chunkId}`
      );

      // Only reload if this is the currently selected chunk
      if (selectedChunk && selectedChunk.id === chunkId) {
        console.log('[PrimaryVideoPlayer] Reloading chunk data...');

        try {
          // Show "processing complete" notification
          setNotificationMessage('Corrections applied - video updated');
          setShowUpdateNotification(true);

          // Reload chunk list to get fresh data
          await loadVideoChunks();

          // Force reload video URL with cache-busting
          await handleChunkSelect(selectedChunk);

          // Force video player remount
          setVideoReloadKey(prev => prev + 1);

          // Force switch to processed video
          setShowRawVideo(false);

          // Trigger detection data refresh
          setDetectionDataKey(prev => prev + 1);

          // Clear processing progress
          setProcessingProgress(null);

          // Hide notification after 3 seconds
          setTimeout(() => {
            setShowUpdateNotification(false);
          }, 3000);

          console.log('[PrimaryVideoPlayer] ✅ Chunk reload complete with video refresh');
        } catch (error) {
          console.error('[PrimaryVideoPlayer] Failed to reload chunk:', error);
          setShowUpdateNotification(false);
        }
      }
    };

    // Add event listeners
    window.addEventListener('corrections:submitted', handleCorrectionsSubmitted);
    window.addEventListener('chunk:updated', handleChunkUpdate);

    // Cleanup
    return () => {
      window.removeEventListener('corrections:submitted', handleCorrectionsSubmitted);
      window.removeEventListener('chunk:updated', handleChunkUpdate);
    };
  }, [selectedChunk]);

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
      // Add cache-busting timestamp to force video reload
      url.searchParams.append('t', Date.now().toString());

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

  // Check if this is a PTZ-capable stream (RTSP with credentials)
  // Camera manages its own presets (0-9), so we always enable auto-scan for PTZ streams
  const hasPTZCredentials = !!(
    streamConfig?.ptzCredentials?.username ||
    streamConfig?.username ||
    (sourceUrl && localStorage.getItem(`ptz_auth_${sourceUrl}`))
  );

  // Debug: Log PTZ capability check
  console.log('🎯 Auto-Scan Check:', {
    streamId: stream.id,
    sourceUrl,
    hasPTZCredentials,
    configUsername: streamConfig?.username,
    ptzCredUsername: streamConfig?.ptzCredentials?.username,
    localStorageKey: sourceUrl ? `ptz_auth_${sourceUrl}` : 'N/A',
    hasLocalStorage: sourceUrl ? !!localStorage.getItem(`ptz_auth_${sourceUrl}`) : false,
  });

  // Default to scanning presets 1-8 (camera's preset range)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _defaultPresetCount = 8;

  // Auto-scan handlers
  const handleStartAutoScan = async () => {
    if (isAutoScanning) return;

    setIsAutoScanning(true);
    setShowAutoScanDialog(true);

    try {
      const token = await getAuthToken();
      if (!token) {
        console.error('No authentication token available');
        setIsAutoScanning(false);
        return;
      }

      // Get PTZ credentials from config or localStorage
      let ptzCredentials: { username: string; password: string } | undefined;
      if (streamConfig?.ptzCredentials?.username) {
        ptzCredentials = streamConfig.ptzCredentials;
      } else if (streamConfig?.username && streamConfig?.password) {
        ptzCredentials = { username: streamConfig.username, password: streamConfig.password };
      } else if (sourceUrl) {
        const stored = localStorage.getItem(`ptz_auth_${sourceUrl}`);
        if (stored) {
          try {
            ptzCredentials = JSON.parse(stored);
          } catch (e) {
            console.warn('Failed to parse stored PTZ credentials');
          }
        }
      }

      // Get saved presets from stream config or localStorage
      // Only scan presets that have been explicitly saved/configured
      let savedPresetNumbers: number[] = [];

      if (streamConfig?.ptzPresets && Object.keys(streamConfig.ptzPresets).length > 0) {
        // Use presets from database config
        savedPresetNumbers = Object.keys(streamConfig.ptzPresets).map(k => parseInt(k, 10));
        console.log('📍 Using saved presets from config:', savedPresetNumbers);
      } else if (sourceUrl) {
        // Fallback to localStorage
        const storedPresets = localStorage.getItem(`ptz_presets_${sourceUrl}`);
        if (storedPresets) {
          try {
            const parsed = JSON.parse(storedPresets);
            savedPresetNumbers = parsed.map((p: { number: number }) => p.number);
            console.log('📍 Using saved presets from localStorage:', savedPresetNumbers);
          } catch {
            console.warn('Failed to parse stored presets');
          }
        }
      }

      // If no saved presets, don't pass any - let backend decide default behavior
      const presetsToScan = savedPresetNumbers.length > 0 ? savedPresetNumbers : undefined;

      if (!presetsToScan) {
        console.warn('⚠️ No saved presets found - backend will scan default range');
      }

      const response = await fetch(
        `http://localhost:8000/api/v1/streams/${stream.id}/ptz/auto-scan/start`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            config: {
              recordingDuration: streamConfig?.autoScan?.recordingDuration || 10,
              frameInterval: 5,
              movementDelay: streamConfig?.autoScan?.movementDelay || 5,
              hlsDelay: streamConfig?.autoScan?.hlsDelay || 6,
            },
            // Send credentials if from localStorage (backend will use these if not in stream config)
            ptzCredentials,
            // Only scan saved presets - if none, backend will handle default
            ...(presetsToScan && { presets: presetsToScan }),
          }),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        console.error('Failed to start auto-scan:', error);
        setIsAutoScanning(false);
      }
      // Dialog will receive WebSocket events for progress
    } catch (error) {
      console.error('Error starting auto-scan:', error);
      setIsAutoScanning(false);
    }
  };

  const handleStopAutoScan = async () => {
    try {
      const token = await getAuthToken();
      if (!token) return;

      await fetch(
        `http://localhost:8000/api/v1/streams/${stream.id}/ptz/auto-scan/stop`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
    } catch (error) {
      console.error('Error stopping auto-scan:', error);
    }
    setIsAutoScanning(false);
  };

  const handleAutoScanDialogClose = () => {
    setShowAutoScanDialog(false);
    setIsAutoScanning(false);
    // Refresh chunks in case new ones were recorded
    loadVideoChunks();
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
        <button
          onClick={() => setViewMode('horses')}
          className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            viewMode === 'horses'
              ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
              : 'text-slate-400 hover:text-slate-300 hover:bg-slate-700/50'
          }`}
        >
          <span className="flex items-center justify-center gap-2">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
                clipRule="evenodd"
              />
            </svg>
            Detected Horses ({streamHorses.length})
          </span>
        </button>
      </div>

      {/* Main Video Display - Hidden in horses view mode */}
      {viewMode !== 'horses' && (
        <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
          {(stream.status === 'active' && viewMode === 'live') ||
          (viewMode === 'playback' && currentVideoUrl) ? (
            <>
              <VideoPlayer
                key={`${selectedChunk?.id || 'live'}-${showRawVideo ? 'raw' : 'processed'}-${videoReloadKey}`}
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
                  {viewMode === 'playback'
                    ? 'None Available'
                    : 'Stream Offline'}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

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

      {/* PTZ Camera Controls - Only in Live mode for RTSP streams */}
      {stream.status === 'active' && viewMode === 'live' && sourceUrl && (
        <PTZControls
          streamUrl={sourceUrl}
          streamId={stream.id}
          streamConfig={streamConfig}
          onConfigUpdate={reloadStreamsFromDatabase}
        />
      )}

      {/* Auto-Scan Button - Only in Live mode for PTZ-capable RTSP streams */}
      {stream.status === 'active' && viewMode === 'live' && sourceUrl && hasPTZCredentials && (
        <div className="mt-4">
          <button
            onClick={handleStartAutoScan}
            disabled={isAutoScanning}
            className={`w-full px-6 py-3 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2 ${
              isAutoScanning
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 cursor-not-allowed'
                : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 hover:border-emerald-500/50'
            }`}
          >
            {isAutoScanning ? (
              <>
                <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                Auto-Scan Running...
              </>
            ) : (
              <>
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
                    d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                  />
                </svg>
                Auto-Scan Presets
              </>
            )}
          </button>
          <p className="text-xs text-slate-500 text-center mt-2">
            Scan camera preset locations for horses and record where found
          </p>
        </div>
      )}

      {/* Auto-Scan Progress Dialog */}
      <AutoScanDialog
        isOpen={showAutoScanDialog}
        streamId={stream.id}
        sourceUrl={sourceUrl}
        ptzCredentials={
          streamConfig?.ptzCredentials ||
          (streamConfig?.username && streamConfig?.password
            ? { username: streamConfig.username, password: streamConfig.password }
            : undefined) ||
          (sourceUrl
            ? (() => {
                const stored = localStorage.getItem(`ptz_auth_${sourceUrl}`);
                return stored ? JSON.parse(stored) : undefined;
              })()
            : undefined)
        }
        onClose={handleAutoScanDialogClose}
        onStop={handleStopAutoScan}
      />

      {/* Playback Mode - Video Chunks List and Detection Panel */}
      {viewMode === 'playback' && (
        <div className="grid grid-cols-1 lg:grid-cols-[30%_1fr] gap-4 items-start">
          {/* Left Column: Video Chunks List */}
          <div className="space-y-3 flex flex-col max-h-[1200px]">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-white">
                Processed Video Chunks
              </h3>
            </div>

            {videoChunks.length > 0 ? (
              <div className="space-y-2 flex-1 overflow-y-auto overflow-x-hidden min-h-0">
                {videoChunks.map(chunk => (
                  <div
                    key={chunk.id}
                    onClick={() => handleChunkSelect(chunk)}
                    className={`border rounded-lg transition-all duration-200 cursor-pointer hover:scale-[1.01] w-full overflow-hidden ${
                      chunk.status === 'completed'
                        ? selectedChunk?.id === chunk.id
                          ? 'bg-blue-500/20 border-blue-500/50 text-blue-300 shadow-lg shadow-blue-500/20'
                          : 'bg-slate-800/50 border-slate-700/50 text-slate-300 hover:bg-slate-700/50 hover:border-slate-600/50'
                        : 'bg-slate-800/30 border-slate-700/30 text-slate-500 cursor-not-allowed opacity-60'
                    }`}
                  >
                    <div className="flex gap-3 w-full">
                      {/* Thumbnail */}
                      <div className="relative flex-shrink-0 w-32 h-32 bg-slate-900/50">
                        {chunk.thumbnail_url ? (
                          <img
                            src={`http://localhost:8000${chunk.thumbnail_url}?token=${localStorage.getItem('authToken')}`}
                            alt={`Thumbnail for ${chunk.filename}`}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              // Hide image on error and show placeholder
                              e.currentTarget.style.display = 'none';
                              const placeholder = e.currentTarget.nextElementSibling;
                              if (placeholder) {
                                (placeholder as HTMLElement).style.display = 'flex';
                              }
                            }}
                          />
                        ) : null}
                        {/* Placeholder (shown by default if no thumbnail, or on error) */}
                        <div
                          className="w-full h-full flex items-center justify-center text-slate-600"
                          style={{ display: chunk.thumbnail_url ? 'none' : 'flex' }}
                        >
                          <svg
                            className="w-8 h-8"
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
                        </div>
                        {/* Status indicator overlay */}
                        <div
                          className={`absolute top-1 left-1 w-2 h-2 rounded-full ${
                            chunk.status === 'completed'
                              ? 'bg-green-500'
                              : chunk.status === 'recording'
                                ? 'bg-yellow-500 animate-pulse'
                                : 'bg-red-500'
                          }`}
                        ></div>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0 py-2 pr-3 flex flex-col justify-between">
                        {/* Top row: filename and badges */}
                        <div>
                          <div className="font-medium text-sm truncate mb-1">
                            {chunk.filename}
                          </div>
                          <div className="text-xs opacity-75">
                            {formatDuration(chunk.duration)} •{' '}
                            {formatFileSize(chunk.file_size)}
                          </div>
                          <div className="text-xs opacity-60">
                            {new Date(chunk.created_at).toLocaleTimeString()}
                          </div>
                        </div>

                        {/* Bottom row: badges */}
                        <div className="flex items-center gap-1 flex-wrap text-xs mt-2">
                          {chunk.metadata.resolution && (
                            <span className="px-1.5 py-0.5 bg-slate-700/50 rounded text-[10px]">
                              {chunk.metadata.resolution}
                            </span>
                          )}
                          {chunk.correction_count &&
                            chunk.correction_count > 0 && (
                              <span
                                className="px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded text-[10px] flex items-center gap-1"
                                title="This chunk has been manually corrected"
                              >
                                <svg
                                  className="w-2.5 h-2.5"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                                  />
                                </svg>
                                <span>{chunk.correction_count}</span>
                              </span>
                            )}
                          {selectedChunk?.id === chunk.id && (
                            <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded text-[10px]">
                              Playing
                            </span>
                          )}
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] ${
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
          <div className="detection-panel-container min-w-0 overflow-hidden">
            <DetectionDataPanel
              key={detectionDataKey}
              streamId={stream.id}
              chunkId={selectedChunk?.id || null}
            />
          </div>
        </div>
      )}

      {/* Detected Horses Tab */}
      {viewMode === 'horses' && (
        <div className="detected-horses-container">
          <DetectedHorsesTab
            streamId={stream.id}
            onSelectStreamChunk={async (selectedStreamId, chunkId) => {
              console.log('🎬 onSelectStreamChunk called:', {
                selectedStreamId,
                chunkId,
              });

              // TODO: Handle navigation to different streams if needed
              // For now, if it's a different stream, log a warning
              if (selectedStreamId !== stream.id) {
                console.warn(
                  'Cross-stream navigation not yet implemented. Selected stream:',
                  selectedStreamId
                );
                // Could potentially emit an event or callback to parent to switch streams
                return;
              }

              // If chunk ID is provided, switch to playback mode and load that chunk
              if (chunkId) {
                console.log('🔄 Fetching chunks to find chunk ID:', chunkId);

                try {
                  const token = await getAuthToken();
                  if (!token) {
                    console.error('No authentication token available');
                    return;
                  }

                  // Fetch chunks directly to avoid state timing issues
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
                    const chunks = data.chunks || [];
                    console.log('📦 Fetched chunks:', chunks.length);

                    // Update state for UI
                    setVideoChunks(chunks);

                    // Find the requested chunk
                    const chunk = chunks.find(
                      (c: VideoChunk) => c.id === chunkId
                    );
                    console.log('🔍 Found chunk:', chunk);

                    if (chunk) {
                      if (chunk.status === 'completed') {
                        console.log('✅ Selecting chunk:', chunk.filename);
                        await handleChunkSelect(chunk);
                        setViewMode('playback');
                      } else {
                        console.error(
                          '❌ Chunk not completed. Status:',
                          chunk.status
                        );
                        alert(
                          `Chunk is not ready for playback. Status: ${chunk.status}`
                        );
                      }
                    } else {
                      console.error(
                        '❌ Chunk not found. Available chunks:',
                        chunks.map((c: VideoChunk) => ({
                          id: c.id,
                          filename: c.filename,
                        }))
                      );
                      alert(
                        `Chunk not found. This may be from a different stream or not yet processed.`
                      );
                    }
                  } else {
                    console.error(
                      'Failed to load video chunks:',
                      response.statusText
                    );
                  }
                } catch (error) {
                  console.error('Error loading chunks:', error);
                }
              } else {
                // No chunk ID, just switch to playback view
                console.log(
                  '📺 Switching to playback view without specific chunk'
                );
                setViewMode('playback');
              }
            }}
          />
        </div>
      )}

      {/* Chunk Update Notification (Task 3.2) */}
      {showUpdateNotification && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            backgroundColor: 'rgba(34, 197, 94, 0.95)',
            color: 'white',
            padding: '12px 20px',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            animation: 'slideIn 0.3s ease-out',
          }}
        >
          <span style={{ fontSize: '20px' }}>✓</span>
          <span style={{ fontWeight: '500' }}>
            {notificationMessage}
          </span>
        </div>
      )}
    </div>
  );
};
