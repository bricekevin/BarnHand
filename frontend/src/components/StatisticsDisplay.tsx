import React from 'react';

interface MetricCardProps {
  title: string;
  value: string | number;
  change?: {
    value: string;
    positive: boolean;
  };
  icon?: React.ReactNode;
  color?: 'cyan' | 'success' | 'amber' | 'error';
}

const MetricCard: React.FC<MetricCardProps> = ({ 
  title, 
  value, 
  change, 
  icon,
  color = 'cyan' 
}) => {
  const colorClasses = {
    cyan: 'text-cyan-400',
    success: 'text-success',
    amber: 'text-amber-500', 
    error: 'text-error'
  };

  return (
    <div className="metric-card bg-slate-800/50 rounded-xl p-4 relative overflow-hidden border border-slate-700/50 hover:border-slate-600/50 transition-all duration-200">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm text-slate-400 font-medium">{title}</h4>
        {icon && (
          <div className={`w-8 h-8 rounded-lg bg-slate-700/50 flex items-center justify-center ${colorClasses[color]}`}>
            {icon}
          </div>
        )}
      </div>
      
      <div className="space-y-2">
        <div className={`text-2xl font-mono font-bold ${colorClasses[color]}`}>
          {value}
        </div>
        
        {change && (
          <div className={`flex items-center space-x-1 text-xs ${
            change.positive ? 'text-success' : 'text-error'
          }`}>
            <svg 
              className={`w-3 h-3 ${change.positive ? 'rotate-0' : 'rotate-180'}`} 
              fill="currentColor" 
              viewBox="0 0 20 20"
            >
              <path fillRule="evenodd" d="M5.293 7.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 5.414V17a1 1 0 11-2 0V5.414L6.707 7.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
            <span>{change.value}</span>
          </div>
        )}
      </div>

      {/* Subtle glow effect */}
      <div className={`absolute -top-10 -right-10 w-20 h-20 bg-gradient-radial from-${color === 'cyan' ? 'cyan-500' : color === 'success' ? 'success' : color === 'amber' ? 'amber-500' : 'error'}/10 to-transparent rounded-full`} />
    </div>
  );
};

export const StatisticsDisplay: React.FC = () => {
  // Mock real-time metrics
  const metrics = [
    {
      title: 'Total Horses Tracked',
      value: '47',
      change: { value: '+3 today', positive: true },
      color: 'success' as const,
      icon: (
        <svg fill="currentColor" viewBox="0 0 20 20" className="w-4 h-4">
          <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    },
    {
      title: 'Active Streams',
      value: '4/8',
      change: { value: '+1 this hour', positive: true },
      color: 'cyan' as const,
      icon: (
        <svg fill="currentColor" viewBox="0 0 20 20" className="w-4 h-4">
          <path d="M2 6a2 2 0 012-2h6l2 2h6a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM5 8a1 1 0 000 2h8a1 1 0 100-2H5z" />
        </svg>
      )
    },
    {
      title: 'Detection Accuracy',
      value: '94.2%',
      change: { value: '+2.1% from yesterday', positive: true },
      color: 'success' as const,
      icon: (
        <svg fill="currentColor" viewBox="0 0 20 20" className="w-4 h-4">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      )
    },
    {
      title: 'Processing Delay',
      value: '12.3s',
      change: { value: '-1.2s from target', positive: false },
      color: 'amber' as const,
      icon: (
        <svg fill="currentColor" viewBox="0 0 20 20" className="w-4 h-4">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
        </svg>
      )
    },
    {
      title: 'Data Storage',
      value: '2.4GB',
      change: { value: '+180MB today', positive: true },
      color: 'cyan' as const,
      icon: (
        <svg fill="currentColor" viewBox="0 0 20 20" className="w-4 h-4">
          <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z" />
        </svg>
      )
    },
    {
      title: 'System Health',
      value: '98.9%',
      change: { value: 'All systems operational', positive: true },
      color: 'success' as const,
      icon: (
        <svg fill="currentColor" viewBox="0 0 20 20" className="w-4 h-4">
          <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
      )
    }
  ];

  const performanceData = [
    { time: '00:00', fps: 52, accuracy: 89, horses: 3 },
    { time: '04:00', fps: 48, accuracy: 91, horses: 4 },
    { time: '08:00', fps: 55, accuracy: 94, horses: 6 },
    { time: '12:00', fps: 51, accuracy: 92, horses: 8 },
    { time: '16:00', fps: 49, accuracy: 96, horses: 7 },
    { time: '20:00', fps: 53, accuracy: 94, horses: 5 }
  ];

  return (
    <div className="space-y-6">
      {/* Real-time Metrics Grid */}
      <div className="glass-dark rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-semibold text-slate-100">
            System Statistics
          </h3>
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-success rounded-full animate-pulse" />
            <span className="text-sm text-slate-300">Live</span>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {metrics.map((metric, index) => (
            <MetricCard
              key={index}
              title={metric.title}
              value={metric.value}
              change={metric.change}
              color={metric.color}
              icon={metric.icon}
            />
          ))}
        </div>
      </div>

      {/* Performance Chart */}
      <div className="glass-dark rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h4 className="text-lg font-medium text-slate-100">
            24-Hour Performance
          </h4>
          <div className="flex space-x-4 text-sm">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-cyan-500 rounded-full" />
              <span className="text-slate-400">FPS</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-success rounded-full" />
              <span className="text-slate-400">Accuracy</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 bg-amber-500 rounded-full" />
              <span className="text-slate-400">Horse Count</span>
            </div>
          </div>
        </div>
        
        {/* Simple Chart Visualization */}
        <div className="relative h-48 bg-slate-800/30 rounded-lg p-4 overflow-hidden">
          <div className="absolute inset-0 flex items-end justify-between px-4 pb-4">
            {performanceData.map((point, index) => (
              <div key={index} className="flex flex-col items-center space-y-2">
                {/* FPS Bar */}
                <div 
                  className="w-8 bg-gradient-to-t from-cyan-500 to-cyan-400 rounded-t-sm"
                  style={{ height: `${(point.fps / 60) * 120}px` }}
                />
                {/* Time Label */}
                <span className="text-xs text-slate-400">{point.time}</span>
              </div>
            ))}
          </div>
          
          {/* Grid Lines */}
          <div className="absolute inset-4 pointer-events-none">
            {[25, 50, 75, 100].map((percent) => (
              <div
                key={percent}
                className="absolute w-full border-t border-slate-700/30"
                style={{ top: `${100 - percent}%` }}
              />
            ))}
          </div>
        </div>
        
        {/* Performance Summary */}
        <div className="mt-4 grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-lg font-mono font-bold text-cyan-400">51.3</div>
            <div className="text-xs text-slate-400">Avg FPS</div>
          </div>
          <div>
            <div className="text-lg font-mono font-bold text-success">92.7%</div>
            <div className="text-xs text-slate-400">Avg Accuracy</div>
          </div>
          <div>
            <div className="text-lg font-mono font-bold text-amber-500">5.5</div>
            <div className="text-xs text-slate-400">Avg Horse Count</div>
          </div>
        </div>
      </div>
    </div>
  );
};