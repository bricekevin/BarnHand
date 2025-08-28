import React, { useEffect, useState } from 'react';

import { useWebSocket } from '../hooks/useWebSocket';

export const ConnectionStatus: React.FC = () => {
  const { isConnected, connectionStatus } = useWebSocket({ autoConnect: true });
  const [showReconnecting, setShowReconnecting] = useState(false);

  useEffect(() => {
    if (connectionStatus === 'connecting') {
      setShowReconnecting(true);
      const timer = setTimeout(() => setShowReconnecting(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [connectionStatus]);

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connected':
        return 'bg-success';
      case 'connecting':
        return 'bg-amber-500';
      case 'error':
        return 'bg-error';
      case 'disconnected':
      default:
        return 'bg-slate-400';
    }
  };

  const getStatusText = () => {
    switch (connectionStatus) {
      case 'connected':
        return 'System Online';
      case 'connecting':
        return 'Connecting...';
      case 'error':
        return 'Connection Error';
      case 'disconnected':
      default:
        return 'Offline';
    }
  };

  return (
    <div className="relative">
      <div 
        className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg transition-all duration-300 ${
          isConnected 
            ? 'bg-success/10 border border-success/30' 
            : 'bg-slate-800/50 border border-slate-700'
        }`}
      >
        <div className="relative">
          <div 
            className={`w-2 h-2 rounded-full ${getStatusColor()} ${
              connectionStatus === 'connected' ? 'animate-pulse' : ''
            }`}
          />
          {connectionStatus === 'connecting' && (
            <div className="absolute inset-0">
              <div className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
            </div>
          )}
        </div>
        <span className={`text-xs font-medium ${
          isConnected ? 'text-success' : 'text-slate-400'
        }`}>
          {getStatusText()}
        </span>
      </div>

      {/* Reconnection notification */}
      {showReconnecting && connectionStatus === 'connecting' && (
        <div className="absolute top-full left-0 mt-2 z-50 animate-fade-in">
          <div className="glass-dark rounded-lg px-3 py-2 shadow-lg">
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-amber-400">
                Attempting to reconnect...
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Error tooltip */}
      {connectionStatus === 'error' && (
        <div className="absolute top-full left-0 mt-2 z-50">
          <div className="glass-dark rounded-lg px-3 py-2 shadow-lg max-w-xs">
            <p className="text-xs text-error">
              Unable to establish connection. Please check your network and try refreshing.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

// Compact version for header
export const ConnectionIndicator: React.FC = () => {
  const { isConnected, connectionStatus } = useWebSocket({ autoConnect: true });

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connected':
        return 'bg-success';
      case 'connecting':
        return 'bg-amber-500 animate-pulse';
      case 'error':
        return 'bg-error';
      case 'disconnected':
      default:
        return 'bg-slate-400';
    }
  };

  return (
    <div 
      className={`w-2 h-2 rounded-full ${getStatusColor()}`}
      title={connectionStatus === 'connected' ? 'Real-time updates active' : 'Real-time updates inactive'}
    />
  );
};

// Detailed status panel
export const ConnectionPanel: React.FC = () => {
  const { 
    isConnected, 
    connectionStatus, 
    subscribedStreams,
    connect,
    disconnect 
  } = useWebSocket({ autoConnect: false });

  const [attemptCount, setAttemptCount] = useState(0);
  const [lastConnected, setLastConnected] = useState<Date | null>(null);

  useEffect(() => {
    if (connectionStatus === 'connecting') {
      setAttemptCount(prev => prev + 1);
    } else if (connectionStatus === 'connected') {
      setAttemptCount(0);
      setLastConnected(new Date());
    }
  }, [connectionStatus]);

  const formatTimeSince = (date: Date | null) => {
    if (!date) return 'Never';
    
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  return (
    <div className="glass-dark rounded-xl p-6">
      <h3 className="text-lg font-semibold text-slate-100 mb-4">
        Real-time Connection
      </h3>

      <div className="space-y-4">
        {/* Status */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-400">Status</span>
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${
              isConnected ? 'bg-success' : 'bg-slate-400'
            } ${connectionStatus === 'connecting' ? 'animate-pulse' : ''}`} />
            <span className={`text-sm font-medium ${
              isConnected ? 'text-success' : 'text-slate-400'
            }`}>
              {connectionStatus.charAt(0).toUpperCase() + connectionStatus.slice(1)}
            </span>
          </div>
        </div>

        {/* Last Connected */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-400">Last Connected</span>
          <span className="text-sm text-slate-300">
            {formatTimeSince(lastConnected)}
          </span>
        </div>

        {/* Active Streams */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-400">Active Streams</span>
          <span className="text-sm font-mono text-cyan-400">
            {subscribedStreams.length}
          </span>
        </div>

        {/* Reconnect Attempts */}
        {attemptCount > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-400">Reconnect Attempts</span>
            <span className="text-sm font-mono text-amber-400">
              {attemptCount}
            </span>
          </div>
        )}

        {/* Actions */}
        <div className="pt-4 border-t border-slate-700">
          {isConnected ? (
            <button
              onClick={disconnect}
              className="w-full btn-secondary text-sm flex items-center justify-center"
            >
              <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M3 3a1 1 0 011 1v12a1 1 0 11-2 0V4a1 1 0 011-1zm7.707 3.293a1 1 0 010 1.414L9.414 9H17a1 1 0 110 2H9.414l1.293 1.293a1 1 0 01-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              Disconnect
            </button>
          ) : (
            <button
              onClick={connect}
              disabled={connectionStatus === 'connecting'}
              className="w-full btn-primary text-sm flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {connectionStatus === 'connecting' ? (
                <>
                  <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M3 3a1 1 0 011 1v12a1 1 0 11-2 0V4a1 1 0 011-1zm10.293 3.293a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 01-1.414-1.414L14.586 11H7a1 1 0 110-2h7.586l-1.293-1.293a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                  Connect
                </>
              )}
            </button>
          )}
        </div>

        {/* Subscribed Streams List */}
        {subscribedStreams.length > 0 && (
          <div className="pt-4 border-t border-slate-700">
            <p className="text-xs text-slate-400 mb-2">Subscribed Streams:</p>
            <div className="space-y-1">
              {subscribedStreams.map(streamId => (
                <div
                  key={streamId}
                  className="flex items-center justify-between px-2 py-1 bg-slate-800/50 rounded"
                >
                  <span className="text-xs font-mono text-slate-300">
                    {streamId}
                  </span>
                  <div className="w-1.5 h-1.5 bg-success rounded-full animate-pulse" />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ConnectionStatus;