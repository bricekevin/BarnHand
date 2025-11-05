import React, { useState, useEffect } from 'react';
import { DetectionCorrectionModal } from './DetectionCorrectionModal';
import { useCorrectionStore } from '../stores/correctionStore';
import type { CorrectionPayload } from '@barnhand/shared';

interface MLSettings {
  model: string;
  confidence_threshold: number;
  frame_interval: number;
  allow_new_horses: boolean;
  mode: string;
}

interface ReidDetails {
  similarity_threshold: number;
  known_horses_count: number;
}

interface Detection {
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  confidence: number;
  class_id?: number;
  class_name?: string;
}

interface TrackedHorse {
  id: string;
  name?: string;
  color: [number, number, number];
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  confidence: number;
  track_confidence: number;
  state: string;
  total_detections: number;
  horse_type?: string;
  is_official?: boolean;
  reid_confidence?: number;
}

interface Pose {
  horse_id: string;
  pose: {
    keypoints: Array<{
      x: number;
      y: number;
      confidence: number;
    }>;
    pose_confidence: number;
  };
  confidence: number;
  bbox: any;
}

interface FrameData {
  frame_index: number;
  timestamp: number;
  detections: Detection[];
  tracked_horses: TrackedHorse[];
  poses: Pose[];
  processed: boolean;
  ml_settings?: MLSettings;
  reid_details?: ReidDetails;
}

interface ChunkHorse {
  id: string;
  name?: string;
  color: [number, number, number];
  first_detected_frame: number;
  last_detected_frame: number;
  total_detections: number;
  avg_confidence: number;
  horse_type?: string;
  is_official?: boolean;
}

interface FrameInspectorProps {
  streamId: string;
  chunkId: string | null;
  frames: FrameData[];
  horses: ChunkHorse[];  // Top-level horses array with names
  videoMetadata: {
    fps: number;
    total_frames: number;
    resolution: string;
  };
}

export const FrameInspector: React.FC<FrameInspectorProps> = ({
  streamId,
  chunkId,
  frames,
  horses,
  videoMetadata,
}) => {
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [jumpToFrame, setJumpToFrame] = useState('');
  const [frameImageUrl, setFrameImageUrl] = useState<string | null>(null);

  // Correction modal state
  const [correctionModalOpen, setCorrectionModalOpen] = useState(false);
  const [selectedDetection, setSelectedDetection] = useState<TrackedHorse | null>(null);

  // Correction store
  const { addCorrection } = useCorrectionStore();

  const currentFrame = frames[currentFrameIndex];

  // Create lookup map for horse names by ID
  const horseNameMap = React.useMemo(() => {
    const map = new Map<string, string>();
    horses.forEach(horse => {
      if (horse.name) {
        map.set(horse.id, horse.name);
      }
    });
    return map;
  }, [horses]);

  // Helper to get horse name by ID
  const getHorseName = (horseId: string): string => {
    return horseNameMap.get(horseId) || 'Unnamed Horse';
  };

  // Load frame image with authentication
  useEffect(() => {
    if (!currentFrame?.frame_path) {
      setFrameImageUrl(null);
      return;
    }

    const loadFrameImage = async () => {
      const token = localStorage.getItem('authToken');
      if (!token) {
        setFrameImageUrl(null);
        return;
      }

      try {
        const response = await fetch(
          `http://localhost:8000/api/v1/streams/${streamId}/chunks/${chunkId}/frames/${currentFrame.frame_path}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (response.ok) {
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          setFrameImageUrl(url);
        } else {
          setFrameImageUrl(null);
        }
      } catch (error) {
        console.error('Failed to load frame image:', error);
        setFrameImageUrl(null);
      }
    };

    loadFrameImage();

    // Cleanup object URL when component unmounts or frame changes
    return () => {
      if (frameImageUrl) {
        URL.revokeObjectURL(frameImageUrl);
      }
    };
  }, [currentFrame?.frame_path, streamId, chunkId]);

  // Auto-play functionality
  useEffect(() => {
    if (!isPlaying || currentFrameIndex >= frames.length - 1) {
      if (isPlaying) setIsPlaying(false);
      return;
    }

    const interval = setInterval(() => {
      setCurrentFrameIndex(prev => {
        if (prev >= frames.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 1000 / videoMetadata.fps);

    return () => clearInterval(interval);
  }, [isPlaying, currentFrameIndex, frames.length, videoMetadata.fps]);

  const handlePrevious = () => {
    setCurrentFrameIndex(prev => Math.max(0, prev - 1));
    setIsPlaying(false);
  };

  const handleNext = () => {
    setCurrentFrameIndex(prev => Math.min(frames.length - 1, prev + 1));
    setIsPlaying(false);
  };

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handleJumpToFrame = () => {
    const frameNum = parseInt(jumpToFrame, 10);
    if (!isNaN(frameNum) && frameNum >= 0 && frameNum < frames.length) {
      setCurrentFrameIndex(frameNum);
      setJumpToFrame('');
    }
  };

  const rgbToString = (color: [number, number, number]): string => {
    return `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
  };

  const handleEditDetection = (horse: TrackedHorse) => {
    setSelectedDetection(horse);
    setCorrectionModalOpen(true);
  };

  const handleSubmitCorrection = (correction: CorrectionPayload) => {
    // Add correction to the store
    addCorrection(correction);
    console.log('Correction queued:', correction);
  };

  if (!currentFrame) {
    return (
      <div className="frame-inspector control-panel">
        <h3 className="text-sm font-semibold text-cyan-400 mb-3 uppercase tracking-wide">
          Frame-by-Frame Inspector
        </h3>
        <div className="text-slate-400 text-center py-8">
          <p className="text-sm">No frame data available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="frame-inspector control-panel">
      <h3 className="text-sm font-semibold text-cyan-400 mb-3 uppercase tracking-wide">
        Frame-by-Frame Inspector
      </h3>

      {/* Controls */}
      <div className="flex items-center justify-between mb-4 gap-4">
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrevious}
            disabled={currentFrameIndex === 0}
            className="px-3 py-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-600 rounded-lg transition-colors"
          >
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
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
          <button
            onClick={handlePlayPause}
            className="px-3 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg transition-colors"
          >
            {isPlaying ? (
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
                  d="M10 9v6m4-6v6"
                />
              </svg>
            ) : (
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
                  d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                />
              </svg>
            )}
          </button>
          <button
            onClick={handleNext}
            disabled={currentFrameIndex === frames.length - 1}
            className="px-3 py-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-600 rounded-lg transition-colors"
          >
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
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>
        </div>

        <div className="flex items-center gap-2 flex-1">
          <span className="text-slate-300 text-sm whitespace-nowrap">
            Frame {currentFrame.frame_index} / {videoMetadata.total_frames}
          </span>
          <input
            type="range"
            min="0"
            max={frames.length - 1}
            value={currentFrameIndex}
            onChange={e => setCurrentFrameIndex(parseInt(e.target.value, 10))}
            className="flex-1"
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="number"
            value={jumpToFrame}
            onChange={e => setJumpToFrame(e.target.value)}
            placeholder="Frame #"
            className="w-20 px-2 py-1 bg-slate-800 text-slate-300 rounded border border-slate-600 focus:border-cyan-400 focus:outline-none"
          />
          <button
            onClick={handleJumpToFrame}
            className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors text-sm"
          >
            Jump
          </button>
        </div>
      </div>

      {/* Frame Status Badges */}
      <div className="flex items-center gap-2 mb-4">
        <span className="px-3 py-1 bg-cyan-500/20 text-cyan-400 rounded-full text-xs font-semibold">
          {currentFrame.processed ? 'Processed' : 'Skipped'}
        </span>
        <span className="px-3 py-1 bg-slate-700 text-slate-300 rounded-full text-xs font-semibold">
          {currentFrame.timestamp.toFixed(2)}s
        </span>
        {currentFrame.ml_settings && (
          <span className="px-3 py-1 bg-purple-500/20 text-purple-400 rounded-full text-xs font-semibold">
            {currentFrame.ml_settings.mode} mode
          </span>
        )}
      </div>

      {/* Frame Image Display */}
      {currentFrame.frame_path && (
        <div className="mb-4 bg-slate-800/50 rounded-lg p-4">
          <h4 className="text-xs font-semibold text-cyan-400 uppercase mb-3">
            Processed Frame with Overlays
          </h4>
          <div className="relative">
            {frameImageUrl ? (
              <img
                src={frameImageUrl}
                alt={`Frame ${currentFrame.frame_index}`}
                className="w-full h-auto rounded border border-slate-700"
              />
            ) : (
              <div className="w-full aspect-video bg-slate-900 rounded border border-slate-700 flex items-center justify-center">
                <div className="text-center">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400 mb-3"></div>
                  <p className="text-slate-400 text-sm">Loading frame...</p>
                </div>
              </div>
            )}
          </div>
          <div className="text-xs text-slate-400 mt-2 text-center">
            Frame {currentFrame.frame_index} • {videoMetadata.resolution} • {(currentFrame.timestamp).toFixed(2)}s
          </div>
        </div>
      )}

      {/* Frame Analysis Grid */}
      <div className="grid grid-cols-2 gap-4">
        {/* Tracked Horses */}
        <div className="bg-slate-800/50 rounded-lg p-4">
          <h4 className="text-xs font-semibold text-cyan-400 uppercase mb-3">
            Tracked Horses ({currentFrame.tracked_horses.length})
          </h4>
          <div className="space-y-2">
            {currentFrame.tracked_horses.map(horse => (
              <div
                key={horse.id}
                className="p-2 bg-slate-900/50 rounded border-l-4"
                style={{ borderColor: rgbToString(horse.color) }}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 flex-1">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: rgbToString(horse.color) }}
                    ></div>
                    <span className="text-slate-100 font-semibold text-sm">
                      {getHorseName(horse.id)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {horse.is_official && (
                      <span className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded text-xs">
                        Official
                      </span>
                    )}
                    <button
                      onClick={() => handleEditDetection(horse)}
                      className="p-1 hover:bg-slate-700 rounded transition-colors group"
                      title="Edit this detection"
                    >
                      <svg
                        className="w-4 h-4 text-slate-400 group-hover:text-cyan-400 transition-colors"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="text-xs text-slate-400 space-y-0.5">
                  <div>ID: <span className="text-cyan-400 font-mono">{horse.id}</span></div>
                  <div>Confidence: <span className="text-slate-300">{(horse.confidence * 100).toFixed(1)}%</span></div>
                  <div>Track: <span className="text-slate-300">{(horse.track_confidence * 100).toFixed(1)}%</span></div>
                  {horse.reid_confidence !== undefined && (
                    <div>ReID: <span className="text-slate-300">{(horse.reid_confidence * 100).toFixed(1)}%</span></div>
                  )}
                  <div>Bbox: <span className="text-slate-300 font-mono">
                    {horse.bbox.x},{horse.bbox.y} {horse.bbox.width}x{horse.bbox.height}
                  </span></div>
                </div>
              </div>
            ))}
            {currentFrame.tracked_horses.length === 0 && (
              <p className="text-slate-500 text-sm text-center py-2">
                No horses tracked
              </p>
            )}
          </div>
        </div>

        {/* YOLO Detections */}
        <div className="bg-slate-800/50 rounded-lg p-4">
          <h4 className="text-xs font-semibold text-cyan-400 uppercase mb-3">
            YOLO Detections ({currentFrame.detections.length})
          </h4>
          <div className="space-y-2">
            {currentFrame.detections.map((detection, idx) => (
              <div
                key={idx}
                className="p-2 bg-slate-900/50 rounded border-l-4 border-amber-400"
              >
                <div className="text-xs text-slate-400 space-y-0.5">
                  <div>Class: <span className="text-slate-300">{detection.class_name || 'horse'}</span></div>
                  <div>Confidence: <span className="text-amber-400">{(detection.confidence * 100).toFixed(1)}%</span></div>
                  <div>Bbox: <span className="text-slate-300 font-mono">
                    {detection.bbox.x},{detection.bbox.y} {detection.bbox.width}x{detection.bbox.height}
                  </span></div>
                </div>
              </div>
            ))}
            {currentFrame.detections.length === 0 && (
              <p className="text-slate-500 text-sm text-center py-2">
                No detections
              </p>
            )}
          </div>
        </div>

        {/* ML Settings */}
        {currentFrame.ml_settings && (
          <div className="bg-slate-800/50 rounded-lg p-4">
            <h4 className="text-xs font-semibold text-cyan-400 uppercase mb-3">
              ML Settings
            </h4>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Model:</span>
                <span className="text-slate-300 font-mono">{currentFrame.ml_settings.model}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Confidence:</span>
                <span className="text-slate-300 font-mono">{currentFrame.ml_settings.confidence_threshold}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Frame Interval:</span>
                <span className="text-slate-300 font-mono">{currentFrame.ml_settings.frame_interval}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Mode:</span>
                <span className="text-slate-300 font-mono">{currentFrame.ml_settings.mode}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">New Horses:</span>
                <span className={`font-mono ${currentFrame.ml_settings.allow_new_horses ? 'text-green-400' : 'text-red-400'}`}>
                  {currentFrame.ml_settings.allow_new_horses ? 'Allowed' : 'Disabled'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ReID Details */}
        {currentFrame.reid_details && (
          <div className="bg-slate-800/50 rounded-lg p-4">
            <h4 className="text-xs font-semibold text-cyan-400 uppercase mb-3">
              ReID Details
            </h4>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Similarity Threshold:</span>
                <span className="text-slate-300 font-mono">{currentFrame.reid_details.similarity_threshold}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Known Horses:</span>
                <span className="text-slate-300 font-mono">{currentFrame.reid_details.known_horses_count}</span>
              </div>
            </div>
          </div>
        )}

        {/* Pose Estimation */}
        <div className="bg-slate-800/50 rounded-lg p-4 col-span-2">
          <h4 className="text-xs font-semibold text-cyan-400 uppercase mb-3">
            Pose Estimation ({currentFrame.poses.length})
          </h4>
          <div className="space-y-2">
            {currentFrame.poses.map((pose, idx) => {
              const horse = currentFrame.tracked_horses.find(h => h.id === pose.horse_id);
              return (
                <div
                  key={idx}
                  className="p-2 bg-slate-900/50 rounded border-l-4"
                  style={{ borderColor: horse ? rgbToString(horse.color) : 'rgb(148, 163, 184)' }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-slate-100 text-sm font-semibold">
                      {getHorseName(pose.horse_id)}
                    </span>
                    <span className="text-xs text-slate-400">
                      Confidence: <span className="text-slate-300">{(pose.confidence * 100).toFixed(1)}%</span>
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    Keypoints: <span className="text-slate-300">{pose.pose.keypoints.length}</span>
                  </div>
                </div>
              );
            })}
            {currentFrame.poses.length === 0 && (
              <p className="text-slate-500 text-sm text-center py-2">
                No pose data
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Correction Modal */}
      {selectedDetection && (
        <DetectionCorrectionModal
          isOpen={correctionModalOpen}
          onClose={() => {
            setCorrectionModalOpen(false);
            setSelectedDetection(null);
          }}
          detection={selectedDetection}
          frameIndex={currentFrame.frame_index}
          allHorses={horses}
          onSubmit={handleSubmitCorrection}
        />
      )}
    </div>
  );
};
