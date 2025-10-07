import React, { useState, useEffect } from 'react';
import { useAppStore } from '../stores/useAppStore';

interface StreamInfo {
  id: string;
  streamNumber: number;
  videoFile: string;
  isActive: boolean;
  playlistUrl: string;
  status: 'active' | 'inactive' | 'starting' | 'stopping' | 'error';
  error?: string;
}

const AVAILABLE_VIDEOS = [
  'horse1.mp4',
  'horse2.mp4',
  'pawing.mp4',
  'rolling-on-ground.mp4'
];

export const StreamControl: React.FC = () => {
  const [streams, setStreams] = useState<StreamInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const { addStreamWithId, removeStream, streams: appStreams } = useAppStore();

  // Fetch current stream status from backend
  const fetchStreamStatus = async () => {
    try {
      const response = await fetch('http://localhost:8003/api/streams');
      const data = await response.json();

      const initialStreams: StreamInfo[] = AVAILABLE_VIDEOS.map((video, index) => {
        const streamId = `stream_00${index + 1}`;
        const activeStream = data.streams.find((s: any) => s.id === streamId);

        return {
          id: streamId,
          streamNumber: index + 1,
          videoFile: video,
          isActive: activeStream ? activeStream.status === 'active' : false,
          playlistUrl: `http://localhost:8003/stream${index + 1}/playlist.m3u8`,
          status: activeStream ? (activeStream.status === 'active' ? 'active' : 'inactive') : 'inactive'
        };
      });

      setStreams(initialStreams);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch stream status:', error);
      // Fallback to default state
      const initialStreams: StreamInfo[] = AVAILABLE_VIDEOS.map((video, index) => ({
        id: `stream_00${index + 1}`,
        streamNumber: index + 1,
        videoFile: video,
        isActive: false,
        playlistUrl: `http://localhost:8003/stream${index + 1}/playlist.m3u8`,
        status: 'inactive'
      }));
      setStreams(initialStreams);
      setLoading(false);
    }
  };

  // Initialize stream data
  useEffect(() => {
    console.log('🚀 StreamControl component mounted');
    fetchStreamStatus();
  }, []);

  useEffect(() => {
    console.log('📊 Streams state updated:', streams);
  }, [streams]);

  const toggleStream = async (streamIndex: number) => {
    console.log(`🔄 Button clicked for stream index: ${streamIndex}`);

    const stream = streams[streamIndex];
    if (!stream) {
      console.log(`❌ No stream found at index ${streamIndex}`);
      return;
    }

    console.log(`🔄 Toggle stream ${stream.streamNumber} (${stream.id}) - Current status: ${stream.status}, isActive: ${stream.isActive}`);

    // Update UI immediately
    const newStreams = [...streams];
    newStreams[streamIndex] = {
      ...stream,
      status: stream.isActive ? 'stopping' : 'starting'
    };
    setStreams(newStreams);

    try {
      const endpoint = stream.isActive
        ? `/api/streams/stop/${stream.id}`
        : `/api/streams/start/${stream.id}`;

      const requestBody = stream.isActive ? {} : { videoFilename: stream.videoFile };

      console.log(`📡 Making request to: http://localhost:8003${endpoint}`);
      console.log(`📋 Request body:`, requestBody);

      const response = await fetch(`http://localhost:8003${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      console.log(`📨 Response status: ${response.status}`);

      if (response.ok) {
        const responseData = await response.json();
        console.log(`✅ Success response:`, responseData);

        // Update stream status
        newStreams[streamIndex] = {
          ...stream,
          isActive: !stream.isActive,
          status: !stream.isActive ? 'active' : 'inactive',
          error: undefined
        };

        // Sync with Stream Settings
        if (!stream.isActive) {
          // Stream was started - add to Stream Settings
          const streamName = stream.videoFile.replace('.mp4', '').replace(/[_-]/g, ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
          console.log(`🔄 Adding stream ${stream.id} to Stream Settings`);

          addStreamWithId(stream.id, {
            name: streamName,
            url: stream.playlistUrl,
            type: 'local',
            status: 'active',
          });
        } else {
          // Stream was stopped - remove from Stream Settings
          console.log(`🔄 Removing stream ${stream.id} from Stream Settings`);
          removeStream(stream.id);
        }
      } else {
        // Handle error
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.log(`❌ Error response:`, errorData);

        // Special handling for stop errors due to auto-restart
        if (stream.isActive && errorData.error === 'Failed to stop stream') {
          newStreams[streamIndex] = {
            ...stream,
            status: 'error',
            error: 'Auto-restart enabled (stop disabled)'
          };
        } else {
          newStreams[streamIndex] = {
            ...stream,
            status: 'error',
            error: errorData.error || `HTTP ${response.status}`
          };
        }
      }
    } catch (error) {
      // Network error
      console.log(`🚫 Network error:`, error);
      newStreams[streamIndex] = {
        ...stream,
        status: 'error',
        error: error instanceof Error ? error.message : 'Network error'
      };
    }

    setStreams(newStreams);

    // Refresh stream status after a delay to get updated backend state
    setTimeout(() => {
      console.log(`🔄 Auto-refreshing stream status after button click`);
      fetchStreamStatus();
    }, 2000);
  };

  const getStatusColor = (status: StreamInfo['status']) => {
    switch (status) {
      case 'active': return 'text-success';
      case 'inactive': return 'text-slate-400';
      case 'starting': return 'text-warning animate-pulse';
      case 'stopping': return 'text-warning animate-pulse';
      case 'error': return 'text-error';
      default: return 'text-slate-400';
    }
  };

  const getStatusIcon = (status: StreamInfo['status']) => {
    switch (status) {
      case 'active': return '🟢';
      case 'inactive': return '⚫';
      case 'starting': return '🟡';
      case 'stopping': return '🟡';
      case 'error': return '🔴';
      default: return '⚫';
    }
  };

  const getStatusText = (status: StreamInfo['status']) => {
    switch (status) {
      case 'active': return 'Active';
      case 'inactive': return 'Inactive';
      case 'starting': return 'Starting...';
      case 'stopping': return 'Stopping...';
      case 'error': return 'Error';
      default: return 'Unknown';
    }
  };

  if (loading) {
    return (
      <div className="control-panel">
        <div className="flex items-center justify-center py-12">
          <div className="animate-pulse text-slate-400">Loading stream configuration...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="control-panel">
      <div className="control-header mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-100">Stream Control</h2>
            <p className="text-slate-400 text-sm mt-1">
              Start and stop individual HLS video streams for testing
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {streams.map((stream, index) => (
          <div key={stream.id} className="control-card">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <span className="text-lg">{getStatusIcon(stream.status)}</span>
                  <div>
                    <div className="font-medium text-slate-100">
                      Stream {stream.streamNumber}
                    </div>
                    <div className="text-sm text-slate-400">
                      {stream.videoFile}
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <div className={`text-sm font-medium ${getStatusColor(stream.status)}`}>
                    {getStatusText(stream.status)}
                  </div>

                  {stream.error && (
                    <div className="text-xs text-error bg-error/10 px-2 py-1 rounded">
                      {stream.error}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center space-x-3">

                <button
                  onClick={() => {
                    console.log(`🟢 Main button clicked for stream ${index}`);
                    toggleStream(index);
                  }}
                  onMouseDown={() => console.log(`🟡 Mouse down on button ${index}`)}
                  disabled={stream.status === 'starting' || stream.status === 'stopping'}
                  className={`px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200
                    ${stream.isActive
                      ? 'bg-error/20 text-error hover:bg-error/30'
                      : 'bg-success/20 text-success hover:bg-success/30'
                    }
                    disabled:opacity-50 disabled:cursor-not-allowed`}
                  style={{ pointerEvents: 'auto', zIndex: 10 }}
                >
                  {stream.status === 'starting' && 'Starting...'}
                  {stream.status === 'stopping' && 'Stopping...'}
                  {stream.status === 'active' && 'Stop Stream'}
                  {stream.status === 'inactive' && 'Start Stream'}
                  {stream.status === 'error' && (stream.isActive ? 'Stop Stream' : 'Start Stream')}
                </button>
              </div>
            </div>

            {stream.isActive && (
              <div className="mt-3 pt-3 border-t border-slate-700/50">
                <div className="text-xs text-slate-500 space-y-1">
                  <div>Playlist URL: <span className="text-cyan-400 font-mono">{stream.playlistUrl}</span></div>
                  <div>Stream ID: <span className="text-slate-400">{stream.id}</span></div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-6 p-4 bg-slate-800/30 rounded-lg border border-slate-700/30">
        <div className="flex items-center space-x-2 mb-2">
          <span className="text-sm">📝</span>
          <span className="text-sm font-medium text-slate-300">Stream Information</span>
        </div>
        <div className="text-xs text-slate-400 space-y-1">
          <div>• Active streams consume CPU resources for video transcoding</div>
          <div>• Only start streams when needed for testing</div>
          <div>• Video files are looped continuously when active</div>
          <div>• HLS segments are generated at 2-second intervals</div>
        </div>
      </div>
    </div>
  );
};