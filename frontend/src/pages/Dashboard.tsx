import React from 'react';

export const Dashboard: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-950 p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-display font-bold text-slate-100 mb-6">
          BarnHand Dashboard
        </h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Stream Grid - Main Content */}
          <div className="lg:col-span-2">
            <div className="glass-dark rounded-xl p-6 mb-6">
              <h2 className="text-xl font-semibold text-slate-100 mb-4">
                Live Streams
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Placeholder stream cards */}
                {Array.from({ length: 4 }, (_, i) => (
                  <div
                    key={i}
                    className="aspect-video bg-slate-800 rounded-lg border-2 border-dashed border-slate-600 flex items-center justify-center"
                  >
                    <div className="text-center text-slate-400">
                      <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-slate-700 flex items-center justify-center">
                        <svg
                          className="w-6 h-6"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path d="M2 6a2 2 0 012-2h6l2 2h6a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM5 8a1 1 0 000 2h8a1 1 0 100-2H5z" />
                        </svg>
                      </div>
                      <p className="text-sm">Stream {i + 1}</p>
                      <p className="text-xs">No Signal</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Control Panel - Sidebar */}
          <div className="space-y-6">
            {/* Horse Tracking Panel */}
            <div className="glass-dark rounded-xl p-6">
              <h3 className="text-lg font-semibold text-slate-100 mb-4">
                Horse Tracking
              </h3>
              <div className="space-y-3">
                {/* Placeholder horse entries */}
                {Array.from({ length: 3 }, (_, i) => (
                  <div
                    key={i}
                    className="flex items-center space-x-3 p-3 bg-slate-800 rounded-lg"
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-horse-${['red', 'blue', 'green'][i]}`}
                    />
                    <div>
                      <p className="text-sm font-medium text-slate-100">
                        Horse #{i + 1}
                      </p>
                      <p className="text-xs text-slate-400">
                        ID: {`HRS-${String(i + 1).padStart(3, '0')}`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Stream Controls */}
            <div className="glass-dark rounded-xl p-6">
              <h3 className="text-lg font-semibold text-slate-100 mb-4">
                Stream Controls
              </h3>
              <div className="space-y-3">
                <button className="btn-primary w-full">Add Stream</button>
                <button className="btn-secondary w-full">Start All</button>
                <button className="btn-secondary w-full">Stop All</button>
              </div>
            </div>

            {/* System Status */}
            <div className="glass-dark rounded-xl p-6">
              <h3 className="text-lg font-semibold text-slate-100 mb-4">
                System Status
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-400">ML Service</span>
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-success rounded-full" />
                    <span className="text-xs text-slate-300">Online</span>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-400">Stream Service</span>
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-success rounded-full" />
                    <span className="text-xs text-slate-300">Online</span>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-400">Database</span>
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-success rounded-full" />
                    <span className="text-xs text-slate-300">Connected</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
