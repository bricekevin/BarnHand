import React, { useState } from 'react';

import { useSettings, useAppStore } from '../stores/useAppStore';

interface SystemMetrics {
  cpuUsage: number;
  memoryUsage: number;
  gpuUsage: number;
  diskSpace: number;
  networkLatency: number;
  uptime: string;
}

interface DiagnosticInfo {
  modelLoadTime: number;
  avgInferenceTime: number;
  queueSize: number;
  processedChunks: number;
  errorRate: number;
  lastError: string | null;
}

export const AdvancedSettings: React.FC = () => {
  const settings = useSettings();
  const updateSettings = useAppStore(state => state.updateSettings);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [logLevel, setLogLevel] = useState('info');
  const [maxCacheSize, setMaxCacheSize] = useState(500); // MB

  // Mock system metrics - in real app would come from API
  const systemMetrics: SystemMetrics = {
    cpuUsage: 45,
    memoryUsage: 67,
    gpuUsage: 78,
    diskSpace: 23,
    networkLatency: 12,
    uptime: '2d 14h 32m',
  };

  // Mock diagnostic info - in real app would come from API
  const diagnosticInfo: DiagnosticInfo = {
    modelLoadTime: 2.3,
    avgInferenceTime: 15.8,
    queueSize: 3,
    processedChunks: 1247,
    errorRate: 0.2,
    lastError: null,
  };

  const getUsageColor = (percentage: number) => {
    if (percentage < 50) return 'text-success';
    if (percentage < 80) return 'text-amber-400';
    return 'text-error';
  };

  const getSystemHealth = () => {
    const avgUsage = (systemMetrics.cpuUsage + systemMetrics.memoryUsage + systemMetrics.gpuUsage) / 3;
    if (avgUsage < 60) return { status: 'Excellent', color: 'text-success' };
    if (avgUsage < 80) return { status: 'Good', color: 'text-amber-400' };
    return { status: 'Needs Attention', color: 'text-error' };
  };

  return (
    <div className="control-panel">
      <div className="control-group">
        <h2 className="text-xl font-semibold text-slate-100 mb-6 flex items-center">
          <svg className="w-6 h-6 mr-3 text-cyan-400" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
          </svg>
          Advanced System Settings
        </h2>

        {/* System Health Overview */}
        <div className="mb-8">
          <div className="control-label mb-4">System Health Status</div>
          <div className="neu-input p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-semibold text-slate-100 mb-2">Overall Health</h3>
                <div className={`text-sm ${getSystemHealth().color} flex items-center`}>
                  <div className={`w-3 h-3 rounded-full mr-2 ${getSystemHealth().color.replace('text-', 'bg-')} animate-pulse`} />
                  {getSystemHealth().status}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-400 mb-1">System Uptime</div>
                <div className="control-value text-lg">{systemMetrics.uptime}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="text-center">
                <div className="text-xs text-slate-400 mb-2">CPU Usage</div>
                <div className={`text-2xl font-mono font-bold ${getUsageColor(systemMetrics.cpuUsage)}`}>
                  {systemMetrics.cpuUsage}%
                </div>
              </div>
              <div className="text-center">
                <div className="text-xs text-slate-400 mb-2">Memory</div>
                <div className={`text-2xl font-mono font-bold ${getUsageColor(systemMetrics.memoryUsage)}`}>
                  {systemMetrics.memoryUsage}%
                </div>
              </div>
              <div className="text-center">
                <div className="text-xs text-slate-400 mb-2">GPU</div>
                <div className={`text-2xl font-mono font-bold ${getUsageColor(systemMetrics.gpuUsage)}`}>
                  {systemMetrics.gpuUsage}%
                </div>
              </div>
              <div className="text-center">
                <div className="text-xs text-slate-400 mb-2">Disk Free</div>
                <div className={`text-2xl font-mono font-bold ${getUsageColor(100 - systemMetrics.diskSpace)}`}>
                  {systemMetrics.diskSpace}GB
                </div>
              </div>
              <div className="text-center">
                <div className="text-xs text-slate-400 mb-2">Network</div>
                <div className={`text-2xl font-mono font-bold ${systemMetrics.networkLatency < 50 ? 'text-success' : 'text-amber-400'}`}>
                  {systemMetrics.networkLatency}ms
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Debug Mode Toggle */}
        <div className="mb-8">
          <div className="control-label mb-4">Debug Configuration</div>
          <div className="space-y-4">
            <div className="neu-input p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-medium text-slate-300 mb-2">
                    Enable Debug Mode
                  </h3>
                  <p className="text-xs text-slate-400">
                    Show detailed diagnostic information and performance metrics
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
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500"></div>
                </label>
              </div>

              {settings.enableDebugMode && (
                <div className="border-t border-slate-600 pt-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-xs text-slate-400 mb-1">Model Load Time</div>
                      <div className="text-cyan-400 font-mono">{diagnosticInfo.modelLoadTime}s</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400 mb-1">Avg Inference</div>
                      <div className="text-success font-mono">{diagnosticInfo.avgInferenceTime}ms</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400 mb-1">Queue Size</div>
                      <div className="text-amber-400 font-mono">{diagnosticInfo.queueSize} chunks</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400 mb-1">Processed</div>
                      <div className="text-slate-300 font-mono">{diagnosticInfo.processedChunks}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400 mb-1">Error Rate</div>
                      <div className={`font-mono ${diagnosticInfo.errorRate < 1 ? 'text-success' : 'text-error'}`}>
                        {diagnosticInfo.errorRate}%
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400 mb-1">Last Error</div>
                      <div className="text-slate-400 font-mono text-xs">
                        {diagnosticInfo.lastError || 'None'}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Logging Configuration */}
            <div className="neu-input p-6">
              <div className="mb-4">
                <h3 className="text-sm font-medium text-slate-300 mb-3">
                  Logging Level
                </h3>
                <select
                  value={logLevel}
                  onChange={e => setLogLevel(e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-slate-300 text-sm focus:outline-none focus:border-cyan-500"
                >
                  <option value="error">Error Only</option>
                  <option value="warn">Warning & Error</option>
                  <option value="info">Info, Warning & Error</option>
                  <option value="debug">Debug (All Messages)</option>
                </select>
              </div>
              <p className="text-xs text-slate-400">
                Higher levels include more detailed information but may impact performance
              </p>
            </div>
          </div>
        </div>

        {/* Cache & Storage Settings */}
        <div className="mb-8">
          <div className="control-label mb-4">Cache & Storage Management</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="neu-input p-6">
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-300 mb-3">
                  Max Cache Size (MB)
                </label>
                <input
                  type="range"
                  min="100"
                  max="2000"
                  step="50"
                  value={maxCacheSize}
                  onChange={e => setMaxCacheSize(parseInt(e.target.value))}
                  className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer slider"
                />
                <div className="flex justify-between text-xs text-slate-400 mt-2">
                  <span>100MB</span>
                  <span className="control-value">{maxCacheSize}MB</span>
                  <span>2GB</span>
                </div>
              </div>
              <p className="text-xs text-slate-400">
                Larger cache improves performance but uses more memory
              </p>
            </div>

            <div className="neu-input p-6">
              <h3 className="text-sm font-medium text-slate-300 mb-4">
                Storage Actions
              </h3>
              <div className="space-y-3">
                <button className="w-full btn-secondary text-sm py-2">
                  Clear Processing Cache
                </button>
                <button className="w-full btn-secondary text-sm py-2">
                  Clear Model Cache
                </button>
                <button className="w-full btn-accent text-sm py-2">
                  Export System Logs
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Advanced Feature Toggles */}
        <div className="mb-8">
          <div className="control-label mb-4">Advanced Features</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="neu-input p-4">
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium text-slate-300">
                  GPU Memory Optimization
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
                Automatically manage GPU memory allocation
              </p>
            </div>

            <div className="neu-input p-4">
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium text-slate-300">
                  Auto-failover to CPU
                </label>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    defaultChecked={true}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                </label>
              </div>
              <p className="text-xs text-slate-400">
                Fallback to CPU processing if GPU fails
              </p>
            </div>

            <div className="neu-input p-4">
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium text-slate-300">
                  Telemetry Collection
                </label>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    defaultChecked={false}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500"></div>
                </label>
              </div>
              <p className="text-xs text-slate-400">
                Send anonymous usage data to improve the system
              </p>
            </div>

            <div className="neu-input p-4">
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium text-slate-300">
                  Experimental Features
                </label>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    defaultChecked={false}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-error"></div>
                </label>
              </div>
              <p className="text-xs text-slate-400">
                Enable beta features (may be unstable)
              </p>
            </div>
          </div>
        </div>

        {/* System Actions */}
        <div className="flex flex-wrap gap-4">
          <button className="btn-primary flex items-center">
            <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            Save Configuration
          </button>
          <button className="btn-secondary flex items-center">
            <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export Configuration
          </button>
          <button className="btn-accent flex items-center">
            <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
            </svg>
            Run System Diagnostics
          </button>
          <button className="btn-error flex items-center ml-auto">
            <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
            </svg>
            Restart Services
          </button>
        </div>
      </div>
    </div>
  );
};