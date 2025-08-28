import React, { useState } from 'react';

import { OverlayCanvas } from './OverlayCanvas';
import { VideoPlayer } from './VideoPlayer';
import { useAppStore } from '../stores/useAppStore';

interface StreamCardProps {
  stream: {
    id: string;
    name: string;
    url: string;
    status: 'active' | 'inactive' | 'processing' | 'error';
    horseCount: number;
    accuracy: number;
    lastUpdate?: string;
  };
}

export const StreamCard: React.FC<StreamCardProps> = ({ stream }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const { toggleStream } = useAppStore();

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-success';
      case 'processing':
        return 'bg-cyan-500';
      case 'inactive':
        return 'bg-slate-400';
      case 'error':
        return 'bg-error';
      default:
        return 'bg-slate-400';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active':
        return 'Live';
      case 'processing':
        return 'Processing';
      case 'inactive':
        return 'Offline';
      case 'error':
        return 'Error';
      default:
        return 'Unknown';
    }
  };

  return (
    <div className="stream-card glass bg-slate-900/50 border border-slate-700/50 rounded-xl overflow-hidden transition-all duration-300 hover:transform hover:-translate-y-1 hover:shadow-glow">
      {/* Stream Header */}
      <div className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/80 to-transparent p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div
              className={`w-3 h-3 rounded-full ${getStatusColor(stream.status)} animate-pulse`}
            />
            <span className="text-white text-sm font-medium">
              {getStatusText(stream.status)}
            </span>
          </div>
          <div className="confidence-badge">{stream.accuracy}% accuracy</div>
        </div>
      </div>

      {/* Video Container */}
      <div className="relative aspect-video bg-slate-800 overflow-hidden">
        {stream.status === 'active' ? (
          <>
            <VideoPlayer
              src={stream.url}
              className="w-full h-full object-cover"
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
            />
            <OverlayCanvas
              className="absolute inset-0 pointer-events-none"
              detections={[]} // TODO: Connect to real detections from store
              poses={[]} // TODO: Connect to real poses from store
            />
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-slate-400">
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
              <p className="text-sm">No Signal</p>
            </div>
          </div>
        )}

        {/* Play/Pause Overlay */}
        {stream.status === 'active' && (
          <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity duration-200 bg-black/20">
            <button
              className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-white/30 transition-colors"
              onClick={() => setIsPlaying(!isPlaying)}
            >
              {isPlaying ? (
                <svg
                  className="w-8 h-8 text-white"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zM11 8a1 1 0 012 0v4a1 1 0 11-2 0V8z" />
                </svg>
              ) : (
                <svg
                  className="w-8 h-8 text-white ml-1"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" />
                </svg>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Stream Info */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold text-slate-100 truncate">
            {stream.name}
          </h3>
          <button
            onClick={() => toggleStream(stream.id)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
              stream.status === 'active'
                ? 'bg-error/20 text-error hover:bg-error/30'
                : 'bg-success/20 text-success hover:bg-success/30'
            }`}
          >
            {stream.status === 'active' ? 'Stop' : 'Start'}
          </button>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="text-xs text-slate-400 mb-1">Horses Detected</div>
            <div className="text-xl font-mono font-bold text-cyan-400">
              {stream.horseCount}
            </div>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-3">
            <div className="text-xs text-slate-400 mb-1">Last Update</div>
            <div className="text-sm text-slate-300">
              {stream.lastUpdate || 'Never'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
