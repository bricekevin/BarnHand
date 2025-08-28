import React from 'react';

import { useSettings, useAppStore } from '../stores/useAppStore';

export const Settings: React.FC = () => {
  const settings = useSettings();
  const updateSettings = useAppStore(state => state.updateSettings);

  return (
    <div className="min-h-screen bg-slate-950 p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-display font-bold text-slate-100 mb-6">
          Settings
        </h1>

        <div className="space-y-6">
          {/* ML Configuration */}
          <div className="glass-dark rounded-xl p-6">
            <h2 className="text-xl font-semibold text-slate-100 mb-4">
              ML Configuration
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Confidence Threshold
                </label>
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
                  className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer slider"
                />
                <div className="flex justify-between text-xs text-slate-400 mt-1">
                  <span>0.1</span>
                  <span className="font-mono">
                    {settings.confidenceThreshold}
                  </span>
                  <span>1.0</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Processing Delay (seconds)
                </label>
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
                  className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer slider"
                />
                <div className="flex justify-between text-xs text-slate-400 mt-1">
                  <span>10s</span>
                  <span className="font-mono">{settings.processingDelay}s</span>
                  <span>30s</span>
                </div>
              </div>
            </div>
          </div>

          {/* Display Options */}
          <div className="glass-dark rounded-xl p-6">
            <h2 className="text-xl font-semibold text-slate-100 mb-4">
              Display Options
            </h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-slate-300">
                    Show Pose Overlay
                  </h3>
                  <p className="text-xs text-slate-400">
                    Display skeleton overlay on detected horses
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.showPoseOverlay}
                    onChange={e =>
                      updateSettings({ showPoseOverlay: e.target.checked })
                    }
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-forest-500"></div>
                </label>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-slate-300">
                    Show Tracking IDs
                  </h3>
                  <p className="text-xs text-slate-400">
                    Display tracking IDs above detection boxes
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.showTrackingIds}
                    onChange={e =>
                      updateSettings({ showTrackingIds: e.target.checked })
                    }
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-forest-500"></div>
                </label>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-slate-300">
                    Debug Mode
                  </h3>
                  <p className="text-xs text-slate-400">
                    Show additional debugging information
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.enableDebugMode}
                    onChange={e =>
                      updateSettings({ enableDebugMode: e.target.checked })
                    }
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-forest-500"></div>
                </label>
              </div>
            </div>
          </div>

          {/* System Information */}
          <div className="glass-dark rounded-xl p-6">
            <h2 className="text-xl font-semibold text-slate-100 mb-4">
              System Information
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-slate-400">Version</span>
                  <span className="text-sm font-mono text-slate-300">
                    v0.5.0
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-slate-400">ML Models</span>
                  <span className="text-sm font-mono text-slate-300">
                    YOLO11 + RTMPose
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-slate-400">Database</span>
                  <span className="text-sm font-mono text-slate-300">
                    PostgreSQL + TimescaleDB
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-slate-400">Active Streams</span>
                  <span className="text-sm font-mono text-cyan-400">0</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-slate-400">Tracked Horses</span>
                  <span className="text-sm font-mono text-cyan-400">0</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-slate-400">
                    Processing Delay
                  </span>
                  <span className="text-sm font-mono text-amber-400">
                    {settings.processingDelay}s
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex space-x-4">
            <button className="btn-primary">Save Settings</button>
            <button className="btn-secondary">Reset to Defaults</button>
          </div>
        </div>
      </div>
    </div>
  );
};
