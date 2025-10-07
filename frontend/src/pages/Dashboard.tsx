import React from 'react';
import { StreamManagement } from '../components/StreamManagement';

export const Dashboard: React.FC = () => {
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
                Live stream management and monitoring
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto p-6">
        <div className="animate-fade-in">
          <StreamManagement />
        </div>
      </div>
    </div>
  );
};
