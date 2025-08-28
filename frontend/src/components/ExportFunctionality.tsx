import React, { useState } from 'react';

interface ExportOption {
  id: string;
  name: string;
  description: string;
  format: 'csv' | 'json' | 'pdf' | 'video';
  size?: string;
  icon: React.ReactNode;
}

export const ExportFunctionality: React.FC = () => {
  const [selectedExports, setSelectedExports] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState({
    from: new Date().toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0]
  });
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  const exportOptions: ExportOption[] = [
    {
      id: 'detections-csv',
      name: 'Detection Data (CSV)',
      description: 'Horse detection records with timestamps and confidence scores',
      format: 'csv',
      size: '~2.4MB',
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      )
    },
    {
      id: 'horses-json',
      name: 'Horse Registry (JSON)',
      description: 'Complete horse tracking data with identification history',
      format: 'json',
      size: '~890KB',
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 0v12h8V4H6z" clipRule="evenodd" />
        </svg>
      )
    },
    {
      id: 'analytics-pdf',
      name: 'Analytics Report (PDF)',
      description: 'Comprehensive analysis with charts and statistics',
      format: 'pdf',
      size: '~1.2MB',
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2H4zm0 2h12v8H4V6z" clipRule="evenodd" />
        </svg>
      )
    },
    {
      id: 'processed-video',
      name: 'Processed Video Segments',
      description: 'Video chunks with detection overlays and pose data',
      format: 'video',
      size: '~45GB',
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path d="M2 6a2 2 0 012-2h6l2 2h6a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM5 8a1 1 0 000 2h8a1 1 0 100-2H5z" />
        </svg>
      )
    },
    {
      id: 'pose-data',
      name: 'Pose Analysis Data (JSON)',
      description: 'Biomechanical analysis with joint angles and gait data',
      format: 'json',
      size: '~3.1MB',
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
          <path fillRule="evenodd" d="M4 5a2 2 0 012-2v1a2 2 0 002 2h4a2 2 0 002-2V3a2 2 0 012 2v6a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm2.5 7a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm2.45.775A2.5 2.5 0 119.55 11.225 1 1 0 008.45 12.775z" clipRule="evenodd" />
        </svg>
      )
    },
    {
      id: 'system-logs',
      name: 'System Logs (TXT)',
      description: 'Application logs and performance metrics',
      format: 'csv',
      size: '~567KB',
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
        </svg>
      )
    }
  ];

  const handleExportToggle = (exportId: string) => {
    setSelectedExports(prev => 
      prev.includes(exportId) 
        ? prev.filter(id => id !== exportId)
        : [...prev, exportId]
    );
  };

  const handleSelectAll = () => {
    setSelectedExports(selectedExports.length === exportOptions.length ? [] : exportOptions.map(o => o.id));
  };

  const handleExport = async () => {
    if (selectedExports.length === 0) return;

    setIsExporting(true);
    setExportProgress(0);

    // Simulate export progress
    const interval = setInterval(() => {
      setExportProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsExporting(false);
          // TODO: Implement actual export logic
          alert('Export completed successfully!');
          return 100;
        }
        return prev + 10;
      });
    }, 500);
  };

  const getFormatBadgeColor = (format: string) => {
    switch (format) {
      case 'csv': return 'bg-success/20 text-success border-success/30';
      case 'json': return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30';
      case 'pdf': return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      case 'video': return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      default: return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
    }
  };

  const totalSize = selectedExports.reduce((total, exportId) => {
    const option = exportOptions.find(o => o.id === exportId);
    if (!option?.size) return total;
    
    const sizeMatch = option.size.match(/~?([\d.]+)(KB|MB|GB)/);
    if (!sizeMatch) return total;
    
    const [, amount, unit] = sizeMatch;
    const bytes = parseFloat(amount) * (unit === 'GB' ? 1e9 : unit === 'MB' ? 1e6 : 1e3);
    return total + bytes;
  }, 0);

  const formatFileSize = (bytes: number): string => {
    if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)}GB`;
    if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)}MB`;
    if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(1)}KB`;
    return `${bytes}B`;
  };

  return (
    <div className="glass-dark rounded-xl p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-xl font-semibold text-slate-100">
            Export Data
          </h3>
          <p className="text-slate-400 text-sm mt-1">
            Download your horse tracking data in various formats
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 bg-cyan-500 rounded-full animate-pulse" />
          <span className="text-sm text-slate-300">Ready</span>
        </div>
      </div>

      {/* Date Range Selection */}
      <div className="mb-6">
        <h4 className="text-sm font-medium text-slate-300 mb-3">Date Range</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-slate-400 mb-2">From</label>
            <input
              type="date"
              value={dateRange.from}
              onChange={(e) => setDateRange(prev => ({ ...prev, from: e.target.value }))}
              className="neu-input w-full text-slate-100"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-2">To</label>
            <input
              type="date"
              value={dateRange.to}
              onChange={(e) => setDateRange(prev => ({ ...prev, to: e.target.value }))}
              className="neu-input w-full text-slate-100"
            />
          </div>
        </div>
      </div>

      {/* Export Options */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-medium text-slate-300">Export Options</h4>
          <button
            onClick={handleSelectAll}
            className="text-xs text-cyan-400 hover:text-cyan-300"
          >
            {selectedExports.length === exportOptions.length ? 'Deselect All' : 'Select All'}
          </button>
        </div>
        
        <div className="space-y-2">
          {exportOptions.map((option) => (
            <div
              key={option.id}
              className={`p-4 rounded-lg border cursor-pointer transition-all duration-200 ${
                selectedExports.includes(option.id)
                  ? 'bg-slate-800/70 border-cyan-500/50'
                  : 'bg-slate-800/30 border-slate-700/50 hover:bg-slate-800/50'
              }`}
              onClick={() => handleExportToggle(option.id)}
            >
              <div className="flex items-center space-x-3">
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                  selectedExports.includes(option.id)
                    ? 'bg-cyan-500 border-cyan-500'
                    : 'border-slate-600'
                }`}>
                  {selectedExports.includes(option.id) && (
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
                
                <div className="flex-1">
                  <div className="flex items-center space-x-3">
                    <div className="text-slate-300">
                      {option.icon}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-slate-100">{option.name}</span>
                        <div className="flex items-center space-x-2">
                          <span className={`px-2 py-1 rounded text-xs font-medium border ${getFormatBadgeColor(option.format)}`}>
                            {option.format.toUpperCase()}
                          </span>
                          {option.size && (
                            <span className="text-xs text-slate-400">{option.size}</span>
                          )}
                        </div>
                      </div>
                      <p className="text-sm text-slate-400 mt-1">{option.description}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Export Summary */}
      {selectedExports.length > 0 && (
        <div className="mb-6 p-4 bg-slate-800/30 rounded-lg border border-slate-700/50">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-slate-100">
                {selectedExports.length} item{selectedExports.length !== 1 ? 's' : ''} selected
              </span>
              <span className="text-xs text-slate-400 ml-2">
                Total size: ~{formatFileSize(totalSize)}
              </span>
            </div>
            <div className="text-sm text-slate-400">
              Estimated time: {Math.ceil(totalSize / 1e6)} minutes
            </div>
          </div>
        </div>
      )}

      {/* Export Progress */}
      {isExporting && (
        <div className="mb-6 p-4 bg-slate-800/30 rounded-lg border border-cyan-500/30">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-100">Exporting data...</span>
            <span className="text-sm text-cyan-400">{exportProgress}%</span>
          </div>
          <div className="w-full bg-slate-700 rounded-full h-2">
            <div
              className="bg-gradient-to-r from-cyan-500 to-cyan-400 h-2 rounded-full transition-all duration-300"
              style={{ width: `${exportProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Export Button */}
      <div className="flex space-x-3">
        <button
          onClick={handleExport}
          disabled={selectedExports.length === 0 || isExporting}
          className={`btn-primary flex-1 ${
            selectedExports.length === 0 || isExporting
              ? 'opacity-50 cursor-not-allowed'
              : ''
          }`}
        >
          {isExporting ? (
            <>
              <svg className="w-4 h-4 mr-2 animate-spin" fill="currentColor" viewBox="0 0 20 20">
                <path d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" />
              </svg>
              Exporting...
            </>
          ) : (
            <>
              <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
              Start Export
            </>
          )}
        </button>
        <button className="btn-secondary">
          Schedule Export
        </button>
      </div>
    </div>
  );
};