import React from 'react';

interface StreamSummary {
  id: string;
  name: string;
  status: string;
  horseCount: number;
  last_activity?: Date;
  source_url?: string;
}

interface FarmSummary {
  id: string;
  name: string;
  streamCount: number;
  horseCount: number;
  streams: StreamSummary[];
}

interface FarmCardProps {
  farm: FarmSummary;
  allFarms: FarmSummary[];
  onReassignClick: (
    streamId: string,
    streamName: string,
    currentFarmId: string,
    currentFarmName: string
  ) => void;
}

export const FarmCard: React.FC<FarmCardProps> = ({ farm, allFarms, onReassignClick }) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-success';
      case 'processing': return 'text-amber-400';
      case 'error': return 'text-error';
      default: return 'text-slate-400';
    }
  };

  const getStatusDotColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-success';
      case 'processing': return 'bg-amber-400';
      case 'error': return 'bg-error';
      default: return 'bg-slate-400';
    }
  };

  const formatLastActivity = (date?: Date) => {
    if (!date) return 'Never';

    const now = new Date();
    const activityDate = new Date(date);
    const diffMs = now.getTime() - activityDate.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return activityDate.toLocaleDateString();
  };

  return (
    <div className="bg-slate-900/50 backdrop-blur-sm rounded-xl border border-slate-700/50 p-6 hover:border-slate-600/50 transition-all duration-200">
      {/* Farm Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <div className="text-3xl">🏡</div>
          <div>
            <h3 className="text-xl font-display font-bold text-slate-100">
              {farm.name}
            </h3>
            <p className="text-sm text-slate-400">
              {farm.streamCount} {farm.streamCount === 1 ? 'stream' : 'streams'} • {farm.horseCount} {farm.horseCount === 1 ? 'horse' : 'horses'} tracked
            </p>
          </div>
        </div>
      </div>

      {/* Streams List */}
      {farm.streams.length === 0 ? (
        <div className="text-center py-8 bg-slate-800/30 rounded-lg border border-slate-700/30">
          <div className="text-3xl mb-2">📹</div>
          <p className="text-slate-400 text-sm">No streams assigned to this barn</p>
        </div>
      ) : (
        <div className="space-y-3">
          {farm.streams.map(stream => (
            <div
              key={stream.id}
              className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/30 hover:border-slate-600/50 transition-all duration-200"
            >
              <div className="flex items-center justify-between">
                {/* Stream Info */}
                <div className="flex items-center space-x-3 flex-1">
                  <div className="text-2xl">📹</div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-slate-100 font-medium truncate">
                      {stream.name}
                    </h4>
                    <div className="flex items-center space-x-3 mt-1">
                      <span className={`text-xs font-medium ${getStatusColor(stream.status)} flex items-center`}>
                        <div className={`w-1.5 h-1.5 rounded-full mr-1.5 ${getStatusDotColor(stream.status)} ${
                          stream.status === 'active' ? 'animate-pulse' : ''
                        }`} />
                        {stream.status.charAt(0).toUpperCase() + stream.status.slice(1)}
                      </span>
                      <span className="text-xs text-slate-500">
                        🐴 {stream.horseCount} {stream.horseCount === 1 ? 'horse' : 'horses'}
                      </span>
                      {stream.last_activity && (
                        <span className="text-xs text-slate-500">
                          Last: {formatLastActivity(stream.last_activity)}
                        </span>
                      )}
                    </div>
                    {stream.source_url && (
                      <p className="text-xs text-slate-500 font-mono mt-1 truncate">
                        {stream.source_url}
                      </p>
                    )}
                  </div>
                </div>

                {/* Reassign Button */}
                {allFarms.length > 1 && (
                  <button
                    onClick={() => onReassignClick(stream.id, stream.name, farm.id, farm.name)}
                    className="ml-3 flex items-center px-3 py-2 text-sm bg-cyan-500/10 text-cyan-400 rounded-lg hover:bg-cyan-500/20 border border-cyan-500/20 hover:border-cyan-500/30 transition-all duration-200"
                  >
                    <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                    Reassign
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
