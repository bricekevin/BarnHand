import React, { useState } from 'react';

import { useSettings, useAppStore } from '../stores/useAppStore';

interface ModelPerformance {
  yolo11: {
    fps: number;
    accuracy: number;
    memoryUsage: string;
    status: 'active' | 'inactive';
  };
  yolov5: {
    fps: number;
    accuracy: number;
    memoryUsage: string;
    status: 'active' | 'inactive';
  };
  rtmpose: {
    fps: number;
    accuracy: number;
    memoryUsage: string;
    status: 'active' | 'inactive';
  };
}

export const ModelConfiguration: React.FC = () => {
  const settings = useSettings();
  const updateSettings = useAppStore(state => state.updateSettings);
  const [selectedModel, setSelectedModel] = useState<'yolo11' | 'yolov5'>('yolo11');

  // Mock model performance data - in real app would come from API
  const modelPerformance: ModelPerformance = {
    yolo11: {
      fps: 64,
      accuracy: 94.2,
      memoryUsage: '2.1 GB',
      status: 'active',
    },
    yolov5: {
      fps: 58,
      accuracy: 91.8,
      memoryUsage: '1.8 GB',
      status: 'inactive',
    },
    rtmpose: {
      fps: 72,
      accuracy: 96.5,
      memoryUsage: '1.2 GB',
      status: 'active',
    },
  };

  const getModelColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'text-success';
      case 'inactive':
        return 'text-slate-400';
      default:
        return 'text-amber-400';
    }
  };

  const getConfidenceImpact = (threshold: number) => {
    if (threshold < 0.3) return { text: 'High false positives', color: 'text-error' };
    if (threshold < 0.5) return { text: 'Balanced detection', color: 'text-amber-400' };
    if (threshold < 0.7) return { text: 'Conservative detection', color: 'text-success' };
    return { text: 'Very strict filtering', color: 'text-cyan-400' };
  };

  return (
    <div className="control-panel">
      <div className="control-group">
        <h2 className="text-xl font-semibold text-slate-100 mb-6 flex items-center">
          <svg className="w-6 h-6 mr-3 text-cyan-400" fill="currentColor" viewBox="0 0 20 20">
            <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z" />
          </svg>
          ML Model Configuration
        </h2>

        {/* Model Selection */}
        <div className="mb-8">
          <div className="control-label mb-4">Primary Detection Model</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* YOLO11 Card */}
            <div
              className={`neu-button cursor-pointer transition-all duration-300 ${
                selectedModel === 'yolo11'
                  ? 'border-2 border-success bg-success/10'
                  : 'border border-slate-600 hover:border-slate-500'
              }`}
              onClick={() => setSelectedModel('yolo11')}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-slate-100">YOLO11</h3>
                <div className={`w-3 h-3 rounded-full ${modelPerformance.yolo11.status === 'active' ? 'bg-success animate-pulse' : 'bg-slate-400'}`} />
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div>
                  <div className="text-xs text-slate-400 mb-1">FPS</div>
                  <div className="text-metric text-cyan-400">{modelPerformance.yolo11.fps}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-1">Accuracy</div>
                  <div className="text-metric text-success">{modelPerformance.yolo11.accuracy}%</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-1">Memory</div>
                  <div className="text-metric text-amber-400">{modelPerformance.yolo11.memoryUsage}</div>
                </div>
              </div>
            </div>

            {/* YOLOv5 Card */}
            <div
              className={`neu-button cursor-pointer transition-all duration-300 ${
                selectedModel === 'yolov5'
                  ? 'border-2 border-success bg-success/10'
                  : 'border border-slate-600 hover:border-slate-500'
              }`}
              onClick={() => setSelectedModel('yolov5')}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-slate-100">YOLOv5</h3>
                <div className={`w-3 h-3 rounded-full ${modelPerformance.yolov5.status === 'active' ? 'bg-success animate-pulse' : 'bg-slate-400'}`} />
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div>
                  <div className="text-xs text-slate-400 mb-1">FPS</div>
                  <div className="text-metric text-cyan-400">{modelPerformance.yolov5.fps}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-1">Accuracy</div>
                  <div className="text-metric text-success">{modelPerformance.yolov5.accuracy}%</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-1">Memory</div>
                  <div className="text-metric text-amber-400">{modelPerformance.yolov5.memoryUsage}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RTMPose Status */}
        <div className="mb-8">
          <div className="control-label mb-4">Pose Estimation Model</div>
          <div className="neu-input p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-100 mb-2">RTMPose-M AP10K</h3>
                <p className="text-sm text-slate-400">17-keypoint horse pose estimation</p>
              </div>
              <div className="text-right">
                <div className={`text-sm font-medium ${getModelColor(modelPerformance.rtmpose.status)}`}>
                  {modelPerformance.rtmpose.status === 'active' ? 'Active' : 'Inactive'}
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  {modelPerformance.rtmpose.fps} FPS • {modelPerformance.rtmpose.accuracy}% ACC
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Confidence Threshold */}
        <div className="mb-8">
          <div className="control-label mb-4">Detection Confidence Threshold</div>
          <div className="neu-input p-6">
            <div className="mb-4">
              <input
                type="range"
                min="0.1"
                max="1.0"
                step="0.05"
                value={settings.confidenceThreshold}
                onChange={e =>
                  updateSettings({
                    confidenceThreshold: parseFloat(e.target.value),
                  })
                }
                className="w-full h-3 bg-gradient-to-r from-error via-amber-500 to-success rounded-lg appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #EF4444 0%, #F59E0B 50%, #10B981 100%)`,
                }}
              />
              <div className="flex justify-between text-xs text-slate-400 mt-2">
                <span>0.1</span>
                <span>0.5</span>
                <span>1.0</span>
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="control-value">
                {settings.confidenceThreshold.toFixed(2)}
              </div>
              <div className={`text-sm ${getConfidenceImpact(settings.confidenceThreshold).color}`}>
                {getConfidenceImpact(settings.confidenceThreshold).text}
              </div>
            </div>
          </div>
        </div>

        {/* Model Performance Metrics */}
        <div className="mb-6">
          <div className="control-label mb-4">Real-time Performance</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="metric-card">
              <div className="metric-label">Target FPS</div>
              <div className="metric-value text-cyan-400">&gt;50</div>
              <div className="metric-change positive flex items-center">
                <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M3.293 9.707a1 1 0 010-1.414l6-6a1 1 0 011.414 0l6 6a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L4.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
                Meeting target
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-label">GPU Utilization</div>
              <div className="metric-value text-amber-400">78%</div>
              <div className="metric-change positive flex items-center">
                <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M3.293 9.707a1 1 0 010-1.414l6-6a1 1 0 011.414 0l6 6a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L4.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
                Optimal range
              </div>
            </div>

            <div className="metric-card">
              <div className="metric-label">Memory Usage</div>
              <div className="metric-value text-success">3.3 GB</div>
              <div className="metric-change positive flex items-center">
                <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 10.293a1 1 0 010 1.414l-6 6a1 1 0 01-1.414 0l-6-6a1 1 0 111.414-1.414L9 14.586V3a1 1 0 012 0v11.586l4.293-4.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Within limits
              </div>
            </div>
          </div>
        </div>

        {/* Model Actions */}
        <div className="flex space-x-4">
          <button className="btn-primary flex items-center">
            <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
            </svg>
            Switch Model
          </button>
          <button className="btn-secondary flex items-center">
            <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
            </svg>
            Calibrate Models
          </button>
        </div>
      </div>
    </div>
  );
};