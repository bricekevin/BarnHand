import React, { useState, useEffect } from 'react';

interface Horse {
  id: string;
  color: [number, number, number];
  first_detected_frame: number;
  last_detected_frame: number;
  total_detections: number;
  avg_confidence: number;
  state_distribution: {
    [key: string]: number;
  };
}

interface DetectionFrame {
  frame_index: number;
  timestamp: number;
  detections: Array<{
    horse_id: string;
    bbox: [number, number, number, number];
    confidence: number;
    state: string;
    pose_keypoints?: Array<[number, number, number]>;
  }>;
}

interface DetectionData {
  video_metadata: {
    fps: number;
    duration: number;
    resolution: string;
    total_frames: number;
  };
  summary: {
    total_horses: number;
    total_detections: number;
    processing_time_ms: number;
  };
  horses: Horse[];
  frames: DetectionFrame[];
}

interface DetectionDataPanelProps {
  streamId: string;
  chunkId: string | null;
  onSeekToFrame?: (frameIndex: number) => void;
}

export const DetectionDataPanel: React.FC<DetectionDataPanelProps> = ({
  streamId,
  chunkId,
  onSeekToFrame,
}) => {
  const [detectionData, setDetectionData] = useState<DetectionData | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRawJSON, setShowRawJSON] = useState(false);
  const [selectedHorse, setSelectedHorse] = useState<string | null>(null);

  useEffect(() => {
    if (chunkId) {
      fetchDetectionData();
    } else {
      setDetectionData(null);
      setError(null);
    }
  }, [chunkId]);

  const getAuthToken = () => localStorage.getItem('authToken');

  const fetchDetectionData = async () => {
    if (!chunkId) return;

    setLoading(true);
    setError(null);

    try {
      const token = getAuthToken();
      if (!token) {
        setError('No authentication token available');
        setLoading(false);
        return;
      }

      const response = await fetch(
        `http://localhost:8000/api/v1/streams/${streamId}/chunks/${chunkId}/detections`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setDetectionData(data);
        setError(null);
      } else if (response.status === 404) {
        setError('No detection data available yet');
      } else {
        setError(`Failed to load detections: ${response.statusText}`);
      }
    } catch (err) {
      console.error('Error fetching detection data:', err);
      setError('Error loading detection data');
    } finally {
      setLoading(false);
    }
  };

  const handleTimelineClick = (frameIndex: number) => {
    if (onSeekToFrame) {
      onSeekToFrame(frameIndex);
    }
  };

  const formatDuration = (ms: number): string => {
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const rgbToString = (color: [number, number, number]): string => {
    return `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
  };

  if (!chunkId) {
    return (
      <div className="detection-panel-empty">
        <div className="text-slate-400 text-center py-8">
          <svg
            className="w-12 h-12 mx-auto mb-3 opacity-50"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
          <p className="text-sm">Select a chunk to view detection data</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="detection-panel-loading">
        <div className="text-slate-400 text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400 mb-3"></div>
          <p className="text-sm">Loading detection data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="detection-panel-error">
        <div className="text-amber-400 text-center py-8">
          <svg
            className="w-12 h-12 mx-auto mb-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!detectionData) {
    return null;
  }

  return (
    <div className="detection-data-panel">
      {/* Summary Section */}
      <div className="summary-section control-panel mb-4">
        <h3 className="text-sm font-semibold text-cyan-400 mb-3 uppercase tracking-wide">
          Detection Summary
        </h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="control-group">
            <div className="control-label">Horses Detected</div>
            <div className="control-value text-2xl">
              {detectionData.summary.total_horses}
            </div>
          </div>
          <div className="control-group">
            <div className="control-label">Total Frames</div>
            <div className="control-value text-2xl">
              {detectionData.video_metadata.total_frames}
            </div>
          </div>
          <div className="control-group">
            <div className="control-label">Processing Time</div>
            <div className="control-value text-2xl">
              {formatDuration(detectionData.summary.processing_time_ms)}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 mt-3">
          <div className="control-group">
            <div className="control-label">Resolution</div>
            <div className="text-slate-300 font-mono text-sm">
              {detectionData.video_metadata.resolution}
            </div>
          </div>
          <div className="control-group">
            <div className="control-label">Frame Rate</div>
            <div className="text-slate-300 font-mono text-sm">
              {detectionData.video_metadata.fps} fps
            </div>
          </div>
        </div>
      </div>

      {/* Horse List Section */}
      <div className="horse-list-section control-panel mb-4">
        <h3 className="text-sm font-semibold text-cyan-400 mb-3 uppercase tracking-wide">
          Tracked Horses
        </h3>
        <div className="space-y-2">
          {detectionData.horses.map(horse => (
            <div
              key={horse.id}
              className={`horse-item p-3 rounded-lg cursor-pointer transition-all duration-200 ${
                selectedHorse === horse.id
                  ? 'bg-cyan-500/20 border-l-4 border-cyan-400'
                  : 'bg-slate-800/50 hover:bg-slate-800 border-l-4 border-transparent'
              }`}
              onClick={() =>
                setSelectedHorse(selectedHorse === horse.id ? null : horse.id)
              }
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div
                    className="w-4 h-4 rounded-full border-2 border-white/50"
                    style={{ backgroundColor: rgbToString(horse.color) }}
                  ></div>
                  <span className="font-mono font-semibold text-slate-100">
                    {horse.id}
                  </span>
                </div>
                <span className="text-xs text-slate-400">
                  {horse.total_detections} detections
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-slate-400">Avg Confidence: </span>
                  <span className="text-cyan-400 font-mono">
                    {(horse.avg_confidence * 100).toFixed(1)}%
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">Frames: </span>
                  <span className="text-slate-300 font-mono">
                    {horse.first_detected_frame}-{horse.last_detected_frame}
                  </span>
                </div>
              </div>
              {selectedHorse === horse.id && (
                <div className="mt-3 pt-3 border-t border-slate-700">
                  <div className="text-xs text-slate-400 mb-2">
                    State Distribution:
                  </div>
                  <div className="space-y-1">
                    {Object.entries(horse.state_distribution).map(
                      ([state, count]) => (
                        <div
                          key={state}
                          className="flex justify-between items-center"
                        >
                          <span className="text-slate-300 capitalize">
                            {state}
                          </span>
                          <div className="flex items-center gap-2">
                            <div className="w-24 h-2 bg-slate-700 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-cyan-400 rounded-full"
                                style={{
                                  width: `${(count / horse.total_detections) * 100}%`,
                                }}
                              ></div>
                            </div>
                            <span className="text-cyan-400 font-mono text-xs w-8 text-right">
                              {count}
                            </span>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Frame Timeline Section */}
      <div className="timeline-section control-panel mb-4">
        <h3 className="text-sm font-semibold text-cyan-400 mb-3 uppercase tracking-wide">
          Frame Timeline
        </h3>
        <div className="timeline-scrubber bg-slate-800 rounded-lg p-2 overflow-x-auto">
          <div className="flex gap-1 min-w-max">
            {detectionData.frames.map(frame => (
              <button
                key={frame.frame_index}
                onClick={() => handleTimelineClick(frame.frame_index)}
                className={`timeline-frame flex-shrink-0 w-2 h-12 rounded transition-all duration-150 ${
                  frame.detections.length > 0
                    ? 'bg-cyan-400 hover:bg-cyan-300'
                    : 'bg-slate-700 hover:bg-slate-600'
                }`}
                title={`Frame ${frame.frame_index}: ${frame.detections.length} detections at ${frame.timestamp.toFixed(2)}s`}
              ></button>
            ))}
          </div>
        </div>
        <div className="text-xs text-slate-400 mt-2 text-center">
          {detectionData.frames.filter(f => f.detections.length > 0).length}{' '}
          frames with detections
        </div>
      </div>

      {/* Raw JSON Section */}
      <div className="json-section control-panel">
        <button
          onClick={() => setShowRawJSON(!showRawJSON)}
          className="w-full flex items-center justify-between text-sm font-semibold text-cyan-400 mb-3 uppercase tracking-wide hover:text-cyan-300 transition-colors"
        >
          <span>Raw Detection Data (JSON)</span>
          <svg
            className={`w-5 h-5 transition-transform duration-200 ${showRawJSON ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>
        {showRawJSON && (
          <div className="json-content bg-slate-950 rounded-lg p-4 overflow-auto max-h-96">
            <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap">
              {JSON.stringify(detectionData, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
