import React, { useState, useEffect } from 'react';
import { FrameInspector } from './FrameInspector';
import { CorrectionBatchPanel } from './CorrectionBatchPanel';

interface Horse {
  id: string; // Global tracking ID (e.g., "1_horse_001")
  name?: string; // Optional horse name from registry
  color: [number, number, number];
  first_detected_frame: number;
  last_detected_frame: number;
  total_detections: number;
  avg_confidence: number;
  horse_type?: string; // "official" or "guest"
  is_official?: boolean;
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
    frame_interval?: number;
  };
  summary: {
    total_horses: number;
    total_detections: number;
    frames_analyzed?: number;
    total_frames?: number;
    frame_interval?: number;
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
  const [copySuccess, setCopySuccess] = useState(false);

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
        console.log('Detection data received:', data);
        console.log('Horses array:', data.horses);
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

  const handleCopyJSON = async () => {
    if (!detectionData) return;

    try {
      const jsonString = JSON.stringify(detectionData, null, 2);
      await navigator.clipboard.writeText(jsonString);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy JSON:', err);
    }
  };

  const handleDownloadJSON = () => {
    if (!detectionData) return;

    const jsonString = JSON.stringify(detectionData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `detections_${streamId}_${chunkId}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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
      {/* Correction Batch Panel */}
      <CorrectionBatchPanel streamId={streamId} chunkId={chunkId || ''} />

      {/* Summary Section */}
      <div className="summary-section control-panel mb-4">
        <h3 className="text-sm font-semibold text-cyan-400 mb-3 uppercase tracking-wide">
          Detection Summary
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="control-group">
            <div className="control-label">Horses Detected</div>
            <div className="control-value text-2xl">
              {detectionData.summary.total_horses}
            </div>
          </div>
          <div className="control-group">
            <div className="control-label">Processing Time</div>
            <div className="control-value text-2xl">
              {formatDuration(detectionData.summary.processing_time_ms)}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 mt-3">
          <div className="control-group">
            <div className="control-label">Frames Processed</div>
            <div className="control-value text-xl">
              {detectionData.summary.frames_analyzed ||
                detectionData.frames.length}
            </div>
          </div>
          <div className="control-group">
            <div className="control-label">Total Frames</div>
            <div className="control-value text-xl">
              {detectionData.video_metadata.total_frames}
            </div>
          </div>
          <div className="control-group">
            <div className="control-label">Frame Interval</div>
            <div className="control-value text-xl">
              {detectionData.summary.frame_interval ||
                detectionData.video_metadata.frame_interval ||
                1}
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
                  <div className="flex flex-col">
                    {horse.name ? (
                      <>
                        <span className="font-semibold text-slate-100">
                          {horse.name}
                        </span>
                        <span className="text-xs text-cyan-400 font-mono">
                          ID: {horse.id}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="font-semibold text-slate-100">
                          Unnamed Horse
                        </span>
                        <span className="text-xs text-cyan-400 font-mono">
                          ID: {horse.id}
                        </span>
                      </>
                    )}
                  </div>
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
            {(() => {
              // Create a map of processed frames for quick lookup
              const frameMap = new Map(
                detectionData.frames.map(f => [f.frame_index, f])
              );
              const totalFrames =
                detectionData.video_metadata?.total_frames || 0;
              const frameInterval =
                detectionData.video_metadata?.frame_interval || 1;

              // Generate timeline for ALL frames, marking processed ones
              return Array.from({ length: totalFrames }, (_, i) => {
                const processedFrame = frameMap.get(i);
                const isProcessed = processedFrame !== undefined;
                const hasDetections =
                  isProcessed && processedFrame.detections.length > 0;

                return (
                  <button
                    key={i}
                    onClick={() => isProcessed && handleTimelineClick(i)}
                    className={`timeline-frame flex-shrink-0 w-2 h-12 rounded transition-all duration-150 ${
                      hasDetections
                        ? 'bg-cyan-400 hover:bg-cyan-300'
                        : isProcessed
                          ? 'bg-slate-600 hover:bg-slate-500'
                          : 'bg-slate-800'
                    }`}
                    title={
                      isProcessed
                        ? `Frame ${i}: ${processedFrame.detections.length} detections at ${processedFrame.timestamp.toFixed(2)}s`
                        : `Frame ${i}: Skipped (interval=${frameInterval})`
                    }
                    disabled={!isProcessed}
                  ></button>
                );
              });
            })()}
          </div>
        </div>
        <div className="text-xs text-slate-400 mt-2 text-center">
          {detectionData.frames.filter(f => f.detections.length > 0).length}{' '}
          frames with detections • {detectionData.frames.length} processed •{' '}
          {detectionData.video_metadata?.total_frames || 0} total
        </div>
      </div>

      {/* Frame-by-Frame Inspector Section */}
      <div className="frame-inspector-section mb-4">
        <FrameInspector
          streamId={streamId}
          chunkId={chunkId}
          frames={detectionData.frames}
          horses={detectionData.horses}
          videoMetadata={detectionData.video_metadata}
        />
      </div>

      {/* Raw JSON Section */}
      <div className="json-section control-panel">
        <div className="flex items-center justify-between mb-3 relative z-10">
          <button
            onClick={() => setShowRawJSON(!showRawJSON)}
            className="flex items-center gap-2 text-sm font-semibold text-cyan-400 uppercase tracking-wide hover:text-cyan-300 transition-colors"
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
            <div className="flex gap-2">
              <button
                onClick={handleCopyJSON}
                className="px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors flex items-center gap-2 relative z-10"
                title="Copy JSON to clipboard"
              >
                {copySuccess ? (
                  <>
                    <svg
                      className="w-4 h-4 text-green-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    <span className="text-green-400">Copied!</span>
                  </>
                ) : (
                  <>
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
                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                    <span>Copy</span>
                  </>
                )}
              </button>
              <button
                onClick={handleDownloadJSON}
                className="px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors flex items-center gap-2 relative z-10"
                title="Download JSON file"
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
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
                <span>Download</span>
              </button>
            </div>
          )}
        </div>
        {showRawJSON && (
          <div className="json-content bg-slate-950 rounded-lg p-4 overflow-y-auto overflow-x-hidden max-h-96 border border-slate-800">
            <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap break-words">
              {JSON.stringify(detectionData, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
