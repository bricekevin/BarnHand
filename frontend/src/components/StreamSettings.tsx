import React, { useState } from 'react';

import { useSettings, useAppStore } from '../stores/useAppStore';

interface StreamFormat {
  name: string;
  description: string;
  maxBitrate: string;
  recommended: boolean;
}

interface ProcessingMetrics {
  avgDelay: number;
  chunkSize: number;
  processingRate: number;
  bufferHealth: number;
}

export const StreamSettings: React.FC = () => {
  const settings = useSettings();
  const updateSettings = useAppStore(state => state.updateSettings);
  const [chunkDuration, setChunkDuration] = useState(10);
  const [overlapDuration, setOverlapDuration] = useState(1);
  const [selectedFormat, setSelectedFormat] = useState('hls');

  const streamFormats: StreamFormat[] = [
    {
      name: 'HLS',
      description: 'HTTP Live Streaming - Best browser compatibility',
      maxBitrate: '8 Mbps',
      recommended: true,
    },
    {
      name: 'RTMP',
      description: 'Real-Time Messaging Protocol - Low latency',
      maxBitrate: '10 Mbps',
      recommended: false,
    },
    {
      name: 'WebRTC',
      description: 'Web Real-Time Communication - Ultra low latency',
      maxBitrate: '12 Mbps',
      recommended: false,
    },
  ];

  // Mock processing metrics - in real app would come from API
  const processingMetrics: ProcessingMetrics = {
    avgDelay: settings.processingDelay,
    chunkSize: chunkDuration,
    processingRate: 95.2,
    bufferHealth: 87,
  };

  const getChunkValidation = (duration: number) => {
    if (duration < 5) return { valid: false, message: 'Too short - may cause instability' };
    if (duration > 30) return { valid: false, message: 'Too long - increases latency' };
    if (duration >= 10 && duration <= 15) return { valid: true, message: 'Optimal range' };
    return { valid: true, message: 'Acceptable range' };
  };

  const getOverlapValidation = (overlap: number, chunk: number) => {
    const ratio = overlap / chunk;
    if (ratio < 0.05) return { valid: false, message: 'Too small - may cause gaps' };
    if (ratio > 0.2) return { valid: false, message: 'Too large - increases processing load' };
    return { valid: true, message: 'Good overlap ratio' };
  };

  const getDelayImpact = (delay: number) => {
    if (delay < 15) return { text: 'Real-time processing', color: 'text-success', risk: 'Higher CPU usage' };
    if (delay < 25) return { text: 'Balanced processing', color: 'text-cyan-400', risk: 'Optimal performance' };
    return { text: 'Batch processing', color: 'text-amber-400', risk: 'Higher latency' };
  };

  return (
    <div className="control-panel">
      <div className="control-group">
        <h2 className="text-xl font-semibold text-slate-100 mb-6 flex items-center">
          <svg className="w-6 h-6 mr-3 text-cyan-400" fill="currentColor" viewBox="0 0 20 20">
            <path d="M2 6a2 2 0 012-2h6l2 2h6a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
          </svg>
          Stream Processing Settings
        </h2>

        {/* Chunk Configuration */}
        <div className="mb-8">
          <div className="control-label mb-4">Video Chunk Configuration</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="neu-input p-6">
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-300 mb-3">
                  Chunk Duration (seconds)
                </label>
                <input
                  type="range"
                  min="5"
                  max="30"
                  step="1"
                  value={chunkDuration}
                  onChange={e => setChunkDuration(parseInt(e.target.value))}
                  className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer slider"
                />
                <div className="flex justify-between text-xs text-slate-400 mt-2">
                  <span>5s</span>
                  <span className="control-value text-lg">{chunkDuration}s</span>
                  <span>30s</span>
                </div>
              </div>
              
              <div className={`text-sm mt-3 ${getChunkValidation(chunkDuration).valid ? 'text-success' : 'text-error'}`}>
                {getChunkValidation(chunkDuration).message}
              </div>
            </div>

            <div className="neu-input p-6">
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-300 mb-3">
                  Overlap Duration (seconds)
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="5"
                  step="0.5"
                  value={overlapDuration}
                  onChange={e => setOverlapDuration(parseFloat(e.target.value))}
                  className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer slider"
                />
                <div className="flex justify-between text-xs text-slate-400 mt-2">
                  <span>0.5s</span>
                  <span className="control-value text-lg">{overlapDuration}s</span>
                  <span>5s</span>
                </div>
              </div>
              
              <div className={`text-sm mt-3 ${getOverlapValidation(overlapDuration, chunkDuration).valid ? 'text-success' : 'text-error'}`}>
                {getOverlapValidation(overlapDuration, chunkDuration).message}
              </div>
            </div>
          </div>
        </div>

        {/* Processing Delay */}
        <div className="mb-8">
          <div className="control-label mb-4">Processing Delay Configuration</div>
          <div className="neu-input p-6">
            <div className="mb-4">
              <input
                type="range"
                min="10"
                max="30"
                step="1"
                value={settings.processingDelay}
                onChange={e =>
                  updateSettings({
                    processingDelay: parseInt(e.target.value),
                  })
                }
                className="w-full h-3 bg-gradient-to-r from-success via-cyan-400 to-amber-400 rounded-lg appearance-none cursor-pointer"
              />
              <div className="flex justify-between text-xs text-slate-400 mt-2">
                <span>10s (Real-time)</span>
                <span>20s (Balanced)</span>
                <span>30s (Batch)</span>
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <div>
                <div className="control-value mb-1">
                  {settings.processingDelay}s delay
                </div>
                <div className={`text-sm ${getDelayImpact(settings.processingDelay).color}`}>
                  {getDelayImpact(settings.processingDelay).text}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-400 mb-1">Performance Impact</div>
                <div className="text-sm text-amber-400">
                  {getDelayImpact(settings.processingDelay).risk}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Stream Format Selection */}
        <div className="mb-8">
          <div className="control-label mb-4">Output Stream Format</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {streamFormats.map((format) => (
              <div
                key={format.name}
                className={`neu-button cursor-pointer transition-all duration-300 relative ${
                  selectedFormat === format.name.toLowerCase()
                    ? 'border-2 border-cyan-500 bg-cyan-500/10'
                    : 'border border-slate-600 hover:border-slate-500'
                }`}
                onClick={() => setSelectedFormat(format.name.toLowerCase())}
              >
                {format.recommended && (
                  <div className="absolute -top-2 -right-2 bg-success text-slate-900 text-xs px-2 py-1 rounded-full font-semibold">
                    Recommended
                  </div>
                )}
                <div className="mb-3">
                  <h3 className="text-lg font-semibold text-slate-100">{format.name}</h3>
                  <p className="text-xs text-slate-400 mt-1">{format.description}</p>
                </div>
                <div className="text-xs text-slate-300">
                  Max: {format.maxBitrate}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Processing Metrics */}
        <div className="mb-6">
          <div className="control-label mb-4">Real-time Processing Metrics</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="metric-card">
              <div className="metric-label">Avg Delay</div>
              <div className="metric-value text-cyan-400">{processingMetrics.avgDelay}s</div>
              <div className="metric-change text-slate-400 text-xs">Target: &lt;30s</div>
            </div>

            <div className="metric-card">
              <div className="metric-label">Chunk Size</div>
              <div className="metric-value text-amber-400">{processingMetrics.chunkSize}s</div>
              <div className="metric-change text-slate-400 text-xs">Optimal: 10-15s</div>
            </div>

            <div className="metric-card">
              <div className="metric-label">Processing Rate</div>
              <div className="metric-value text-success">{processingMetrics.processingRate}%</div>
              <div className="metric-change positive flex items-center text-xs">
                <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M3.293 9.707a1 1 0 010-1.414l6-6a1 1 0 011.414 0l6 6a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L4.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
                Excellent
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-label">Buffer Health</div>
              <div className="metric-value text-success">{processingMetrics.bufferHealth}%</div>
              <div className="metric-change positive flex items-center text-xs">
                <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M3.293 9.707a1 1 0 010-1.414l6-6a1 1 0 011.414 0l6 6a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L4.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
                Healthy
              </div>
            </div>
          </div>
        </div>

        {/* Quality Settings */}
        <div className="mb-8">
          <div className="control-label mb-4">Video Quality Settings</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="neu-input p-4">
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium text-slate-300">
                  Adaptive Bitrate
                </label>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    defaultChecked={true}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500"></div>
                </label>
              </div>
              <p className="text-xs text-slate-400">
                Automatically adjust quality based on network conditions
              </p>
            </div>

            <div className="neu-input p-4">
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium text-slate-300">
                  Hardware Acceleration
                </label>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    defaultChecked={true}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-success"></div>
                </label>
              </div>
              <p className="text-xs text-slate-400">
                Use GPU acceleration for video encoding/decoding
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex space-x-4">
          <button className="btn-primary flex items-center">
            <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            Apply Settings
          </button>
          <button className="btn-secondary flex items-center">
            <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
            </svg>
            Reset to Defaults
          </button>
          <button className="btn-accent flex items-center">
            <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Test Configuration
          </button>
        </div>
      </div>
    </div>
  );
};