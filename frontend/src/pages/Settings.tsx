import React, { useState } from 'react';

import { SettingsTab } from '../components/SettingsTab';
import { StreamBarnManagement } from '../components/StreamBarnManagement';
import { StreamControl } from '../components/StreamControl';
import { StreamSettings } from '../components/StreamSettings';

export const Settings: React.FC = () => {
  const [activeTab, setActiveTab] = useState<
    'control' | 'settings' | 'barns' | 'developer'
  >('control');

  const tabs = [
    { id: 'control', label: 'Stream Control', icon: '🎬' },
    { id: 'settings', label: 'Stream Settings', icon: '⚙️' },
    { id: 'barns', label: 'Barn Management', icon: '🏡' },
    { id: 'developer', label: 'Developer', icon: '🔧' },
  ];

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <div className="sticky top-0 bg-slate-950/95 backdrop-blur-sm border-b border-slate-700/50 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-display font-bold text-slate-100">
                System Settings
              </h1>
              <p className="text-slate-400 text-sm mt-1">
                Manage video streams and system configuration
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-2 text-sm">
                <div className="w-2 h-2 bg-success rounded-full animate-pulse" />
                <span className="text-slate-300">System Healthy</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="max-w-7xl mx-auto px-6 pt-6">
        <div className="flex space-x-1 bg-slate-900/50 backdrop-blur-sm rounded-xl p-1 mb-8">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() =>
                setActiveTab(tab.id as 'control' | 'settings' | 'barns' | 'developer')
              }
              className={`flex items-center px-6 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                activeTab === tab.id
                  ? 'bg-cyan-500/20 text-cyan-400 shadow-glow'
                  : 'text-slate-400 hover:text-slate-300 hover:bg-slate-800/50'
              }`}
            >
              <span className="mr-2 text-base">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="pb-8">
          <div className="transition-all duration-300">
            {activeTab === 'control' && <StreamControl />}
            {activeTab === 'settings' && <StreamSettings />}
            {activeTab === 'barns' && <StreamBarnManagement />}
            {activeTab === 'developer' && <SettingsTab />}
          </div>
        </div>
      </div>
    </div>
  );
};
