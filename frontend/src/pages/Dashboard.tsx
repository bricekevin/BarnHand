import React, { useState } from 'react';
import { StreamManagement } from '../components/StreamManagement';
import { HorseTracking } from '../components/HorseTracking';
import { StatisticsDisplay } from '../components/StatisticsDisplay';
import { ExportFunctionality } from '../components/ExportFunctionality';

export const Dashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'streams' | 'tracking' | 'stats' | 'export'>('streams');

  const tabs = [
    { id: 'streams', name: 'Live Streams', icon: '📹' },
    { id: 'tracking', name: 'Horse Tracking', icon: '🐎' },
    { id: 'stats', name: 'Statistics', icon: '📊' },
    { id: 'export', name: 'Export Data', icon: '💾' }
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'streams':
        return <StreamManagement />;
      case 'tracking':
        return <HorseTracking />;
      case 'stats':
        return <StatisticsDisplay />;
      case 'export':
        return <ExportFunctionality />;
      default:
        return <StreamManagement />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-display font-bold text-slate-100">
                BarnHand Dashboard
              </h1>
              <p className="text-slate-400 mt-1">
                Real-time horse tracking and stream management
              </p>
            </div>
            <div className="flex items-center space-x-4">
              {/* System Status Indicators */}
              <div className="flex items-center space-x-3 text-sm">
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-success rounded-full animate-pulse" />
                  <span className="text-slate-300">ML Online</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-success rounded-full animate-pulse" />
                  <span className="text-slate-300">Streams Active</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-cyan-500 rounded-full animate-pulse" />
                  <span className="text-slate-300">Processing</span>
                </div>
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex space-x-1 mt-6">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  activeTab === tab.id
                    ? 'bg-slate-700 text-slate-100 shadow-lg'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto p-6">
        <div className="animate-fade-in">
          {renderContent()}
        </div>
      </div>
    </div>
  );
};
