import React, { useState } from 'react';
import { useAppStore } from '../stores/useAppStore';

interface Horse {
  id: string;
  name?: string;
  trackingId: number;
  color: string;
  confidence: number;
  lastSeen: string;
  streamId: string;
  status: 'active' | 'lost' | 'idle';
  detectionCount: number;
}

export const HorseTracking: React.FC = () => {
  const { horses } = useAppStore();
  const [selectedHorse, setSelectedHorse] = useState<string | null>(null);
  const [showNaming, setShowNaming] = useState<string | null>(null);
  const [horseName, setHorseName] = useState('');

  // Mock horse data for development
  const mockHorses: Horse[] = [
    {
      id: 'horse-1',
      name: 'Thunder',
      trackingId: 1,
      color: '#06B6D4', // cyan
      confidence: 94,
      lastSeen: '2 min ago',
      streamId: 'stream-1',
      status: 'active',
      detectionCount: 142
    },
    {
      id: 'horse-2',
      name: undefined,
      trackingId: 2,
      color: '#10B981', // emerald
      confidence: 87,
      lastSeen: '5 min ago',
      streamId: 'stream-1',
      status: 'active',
      detectionCount: 89
    },
    {
      id: 'horse-3',
      name: 'Storm',
      trackingId: 3,
      color: '#F59E0B', // amber
      confidence: 91,
      lastSeen: '3 min ago',
      streamId: 'stream-2',
      status: 'idle',
      detectionCount: 76
    },
    {
      id: 'horse-4',
      name: undefined,
      trackingId: 4,
      color: '#8B5CF6', // violet
      confidence: 82,
      lastSeen: '15 min ago',
      streamId: 'stream-3',
      status: 'lost',
      detectionCount: 34
    }
  ];

  const displayHorses = horses.length > 0 ? horses : mockHorses;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return (
          <svg className="w-4 h-4 text-success" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        );
      case 'idle':
        return (
          <svg className="w-4 h-4 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
        );
      case 'lost':
        return (
          <svg className="w-4 h-4 text-error" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        );
      default:
        return null;
    }
  };

  const handleNameHorse = (horseId: string) => {
    if (horseName.trim()) {
      // TODO: Update horse name in store
      console.log(`Naming horse ${horseId}: ${horseName}`);
      setHorseName('');
      setShowNaming(null);
    }
  };

  const activeHorses = displayHorses.filter(h => h.status === 'active').length;
  const totalDetections = displayHorses.reduce((sum, h) => sum + h.detectionCount, 0);

  return (
    <div className="space-y-6">
      {/* Header with Stats */}
      <div className="glass-dark rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold text-slate-100">
            Horse Tracking
          </h3>
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-success rounded-full animate-pulse" />
            <span className="text-sm text-slate-300">{activeHorses} Active</span>
          </div>
        </div>
        
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-2xl font-mono font-bold text-cyan-400">{displayHorses.length}</div>
            <div className="text-xs text-slate-400">Total Horses</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-mono font-bold text-success">{activeHorses}</div>
            <div className="text-xs text-slate-400">Currently Active</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-mono font-bold text-amber-500">{totalDetections}</div>
            <div className="text-xs text-slate-400">Total Detections</div>
          </div>
        </div>
      </div>

      {/* Horse List */}
      <div className="glass-dark rounded-xl p-6">
        <h4 className="text-lg font-medium text-slate-100 mb-4">Tracked Horses</h4>
        <div className="space-y-3">
          {displayHorses.map((horse) => (
            <div
              key={horse.id}
              className={`p-4 bg-slate-800/50 rounded-lg border transition-all duration-200 hover:bg-slate-800/70 cursor-pointer ${
                selectedHorse === horse.id ? 'border-cyan-500/50 bg-slate-800/70' : 'border-slate-700/50'
              }`}
              onClick={() => setSelectedHorse(selectedHorse === horse.id ? null : horse.id)}
            >
              <div className="flex items-center space-x-3">
                {/* Color Indicator */}
                <div 
                  className="w-4 h-4 rounded-full flex-shrink-0"
                  style={{ backgroundColor: horse.color }}
                />
                
                {/* Horse Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="font-medium text-slate-100">
                        {horse.name || `Horse #${horse.trackingId}`}
                      </span>
                      {!horse.name && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowNaming(horse.id);
                          }}
                          className="text-xs text-cyan-400 hover:text-cyan-300"
                        >
                          Name
                        </button>
                      )}
                    </div>
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(horse.status)}
                      <span className="text-sm text-slate-300">{horse.confidence}%</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-slate-400">
                      ID: {horse.trackingId.toString().padStart(3, '0')}
                    </span>
                    <span className="text-xs text-slate-400">
                      Last seen: {horse.lastSeen}
                    </span>
                  </div>
                </div>
              </div>

              {/* Expanded Info */}
              {selectedHorse === horse.id && (
                <div className="mt-4 pt-4 border-t border-slate-700">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-slate-400">Stream:</span>
                      <span className="ml-2 text-slate-200">Paddock North</span>
                    </div>
                    <div>
                      <span className="text-slate-400">Detections:</span>
                      <span className="ml-2 text-slate-200">{horse.detectionCount}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">Status:</span>
                      <span className={`ml-2 capitalize ${
                        horse.status === 'active' ? 'text-success' :
                        horse.status === 'idle' ? 'text-amber-500' : 'text-error'
                      }`}>
                        {horse.status}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400">Confidence:</span>
                      <span className="ml-2 text-slate-200">{horse.confidence}%</span>
                    </div>
                  </div>
                  
                  <div className="flex space-x-2 mt-4">
                    <button className="btn-secondary text-xs">View Timeline</button>
                    <button className="btn-secondary text-xs">Export Data</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Empty State */}
        {displayHorses.length === 0 && (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-700/50 flex items-center justify-center">
              <svg className="w-8 h-8 text-slate-400" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-slate-400">No horses detected yet</p>
            <p className="text-xs text-slate-500 mt-1">Start a stream to begin tracking</p>
          </div>
        )}
      </div>

      {/* Horse Naming Modal */}
      {showNaming && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="glass bg-slate-900/90 rounded-xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-semibold text-slate-100 mb-4">
              Name Horse #{displayHorses.find(h => h.id === showNaming)?.trackingId}
            </h3>
            <div>
              <input
                type="text"
                value={horseName}
                onChange={(e) => setHorseName(e.target.value)}
                className="neu-input w-full text-slate-100 placeholder-slate-400"
                placeholder="Enter horse name..."
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleNameHorse(showNaming);
                  if (e.key === 'Escape') setShowNaming(null);
                }}
              />
            </div>
            <div className="flex justify-end space-x-3 mt-4">
              <button
                onClick={() => setShowNaming(null)}
                className="btn-secondary text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => handleNameHorse(showNaming)}
                className="btn-primary text-sm"
              >
                Save Name
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};