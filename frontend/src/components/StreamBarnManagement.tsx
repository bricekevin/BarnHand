import React, { useState, useEffect } from 'react';
import { FarmCard } from './FarmCard';
import { ReassignStreamModal } from './ReassignStreamModal';
import { BarnModal } from './BarnModal';

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
  expected_horse_count?: number;
  streams: StreamSummary[];
  timezone?: string;
  metadata?: Record<string, any>;
}

interface StreamManagementOverview {
  farms: FarmSummary[];
  unassignedStreams: StreamSummary[];
}

interface ReassignModalData {
  streamId: string;
  streamName: string;
  currentFarmId: string;
  currentFarmName: string;
}

interface BarnModalData {
  mode: 'create' | 'edit';
  farm?: FarmSummary;
}

// Helper to decode JWT and extract payload
const decodeJWT = (token: string): { farmId?: string; exp?: number } | null => {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const decoded = JSON.parse(atob(payload));
    return decoded;
  } catch (error) {
    console.error('Failed to decode JWT:', error);
    return null;
  }
};

// Check if JWT token is expired
const isTokenExpired = (token: string): boolean => {
  const decoded = decodeJWT(token);
  if (!decoded || !decoded.exp) return true;
  // Add 60 second buffer before expiry
  return Date.now() >= (decoded.exp * 1000) - 60000;
};

export const StreamBarnManagement: React.FC = () => {
  const [overview, setOverview] = useState<StreamManagementOverview>({ farms: [], unassignedStreams: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reassignModal, setReassignModal] = useState<ReassignModalData | null>(null);
  const [barnModal, setBarnModal] = useState<BarnModalData | null>(null);
  const [draggedStream, setDraggedStream] = useState<StreamSummary | null>(null);

  useEffect(() => {
    fetchStreamManagementOverview();
  }, []);

  const getAuthToken = async (): Promise<string | null> => {
    let token = localStorage.getItem('authToken');

    // Check if token exists and is not expired
    if (token && !isTokenExpired(token)) {
      return token;
    }

    // Clear expired token
    if (token) {
      console.log('🔄 Token expired, refreshing...');
      localStorage.removeItem('authToken');
    }

    // Auto-login for development
    try {
      const response = await fetch('http://localhost:8000/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@barnhand.com', password: 'admin123' }),
      });
      if (response.ok) {
        const data = await response.json();
        token = data.accessToken;
        localStorage.setItem('authToken', token!);
        console.log('✅ New token obtained');
        return token;
      }
    } catch (error) {
      console.error('Auto-login failed:', error);
    }
    return null;
  };

  const fetchStreamManagementOverview = async () => {
    try {
      setLoading(true);
      setError(null);

      const token = await getAuthToken();
      if (!token) {
        setError('Authentication required - please log in');
        setLoading(false);
        return;
      }

      const response = await fetch('http://localhost:8000/api/v1/settings/stream-management', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch stream management data: ${response.status}`);
      }

      const data: StreamManagementOverview = await response.json();
      setOverview(data);
    } catch (err) {
      console.error('Error fetching stream management overview:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleReassignClick = (
    streamId: string,
    streamName: string,
    currentFarmId: string,
    currentFarmName: string
  ) => {
    setReassignModal({
      streamId,
      streamName,
      currentFarmId,
      currentFarmName,
    });
  };

  const handleReassignComplete = () => {
    setReassignModal(null);
    // Refresh the overview after reassignment
    fetchStreamManagementOverview();
  };

  const handleBarnComplete = () => {
    setBarnModal(null);
    // Refresh the overview after barn creation/update
    fetchStreamManagementOverview();
  };

  const handleDeleteBarn = async (farmId: string, farmName: string) => {
    if (!confirm(`Are you sure you want to delete "${farmName}"? This action cannot be undone.\n\nNote: You must reassign or delete all streams and horses first.`)) {
      return;
    }

    try {
      const token = localStorage.getItem('authToken');
      if (!token) {
        alert('Authentication required - please log in');
        return;
      }

      const response = await fetch(`http://localhost:8000/api/v1/settings/farms/${farmId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Failed to delete barn: ${response.status}`);
      }

      // Refresh after successful deletion
      fetchStreamManagementOverview();
    } catch (err) {
      console.error('Error deleting barn:', err);
      alert(err instanceof Error ? err.message : 'Failed to delete barn');
    }
  };

  const handleDragStart = (stream: StreamSummary) => {
    setDraggedStream(stream);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault(); // Allow drop
  };

  const handleDrop = async (farmId: string, _farmName: string) => {
    if (!draggedStream) return;

    try {
      const token = localStorage.getItem('authToken');
      if (!token) {
        alert('Authentication required - please log in');
        return;
      }

      const response = await fetch(
        `http://localhost:8000/api/v1/settings/streams/${draggedStream.id}/farm`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ farmId }),
        }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to assign stream');
      }

      // Refresh after successful assignment
      fetchStreamManagementOverview();
      setDraggedStream(null);
    } catch (err) {
      console.error('Error assigning stream:', err);
      alert(err instanceof Error ? err.message : 'Failed to assign stream');
      setDraggedStream(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500 mx-auto mb-4"></div>
          <p className="text-slate-400">Loading stream management data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-error/10 border border-error/30 rounded-xl p-6">
        <div className="flex items-start">
          <svg className="w-6 h-6 text-error mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <h3 className="text-error font-medium mb-1">Failed to Load Stream Management Data</h3>
            <p className="text-error/80 text-sm">{error}</p>
            <button
              onClick={fetchStreamManagementOverview}
              className="mt-3 text-sm text-cyan-400 hover:text-cyan-300 underline"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display font-bold text-slate-100">
            Stream-to-Barn Management
          </h2>
          <p className="text-slate-400 mt-1">
            Assign video streams to barns and manage horse tracking across your farm
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setBarnModal({ mode: 'create' })}
            className="btn-primary flex items-center"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create Barn
          </button>
          <button
            onClick={fetchStreamManagementOverview}
            className="btn-secondary flex items-center"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      {overview.farms.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-slate-900/50 backdrop-blur-sm rounded-xl border border-slate-700/50 p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-3xl font-bold text-cyan-400">
                  {overview.farms.length}
                </div>
                <div className="text-sm text-slate-400 mt-1">Total Barns</div>
              </div>
              <div className="text-4xl opacity-20">🏡</div>
            </div>
          </div>
          <div className="bg-slate-900/50 backdrop-blur-sm rounded-xl border border-slate-700/50 p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-3xl font-bold text-success">
                  {overview.farms.reduce((sum, f) => sum + f.streamCount, 0)}
                </div>
                <div className="text-sm text-slate-400 mt-1">Total Streams</div>
              </div>
              <div className="text-4xl opacity-20">📹</div>
            </div>
          </div>
          <div className="bg-slate-900/50 backdrop-blur-sm rounded-xl border border-slate-700/50 p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-3xl font-bold text-amber-400">
                  {overview.farms.reduce((sum, f) => sum + f.horseCount, 0)}
                </div>
                <div className="text-sm text-slate-400 mt-1">Total Horses</div>
              </div>
              <div className="text-4xl opacity-20">🐴</div>
            </div>
          </div>
        </div>
      )}

      {/* Unassigned Streams */}
      {overview.unassignedStreams.length > 0 && (
        <div className="bg-gradient-to-br from-amber-900/30 to-orange-900/30 border-2 border-amber-500/50 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <svg className="w-6 h-6 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <h3 className="text-lg font-semibold text-amber-200">
                Unassigned Streams ({overview.unassignedStreams.length})
              </h3>
              <p className="text-sm text-amber-300/80">
                Drag and drop streams onto barns below to assign them
              </p>
            </div>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {overview.unassignedStreams.map(stream => (
              <div
                key={stream.id}
                draggable
                onDragStart={() => handleDragStart(stream)}
                className="flex-shrink-0 bg-slate-900/70 border border-amber-500/50 rounded-lg p-4 cursor-move hover:border-amber-400 hover:shadow-lg transition-all min-w-[200px]"
              >
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <h4 className="font-semibold text-amber-100">{stream.name}</h4>
                </div>
                <div className="text-xs text-amber-300/70 flex items-center gap-2">
                  <span className="capitalize">{stream.status}</span>
                  {stream.horseCount > 0 && (
                    <>
                      <span>•</span>
                      <span>{stream.horseCount} horses</span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Farms List */}
      {overview.farms.length === 0 ? (
        <div className="text-center py-12 bg-slate-900/50 rounded-xl border border-slate-700/50">
          <div className="text-6xl mb-4">🏡</div>
          <h3 className="text-lg font-medium text-slate-300 mb-2">No Barns Found</h3>
          <p className="text-slate-400">Create a barn in the admin panel to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {overview.farms.map(farm => (
            <div
              key={farm.id}
              onDragOver={handleDragOver}
              onDrop={() => handleDrop(farm.id, farm.name)}
              className={draggedStream ? 'ring-2 ring-cyan-500 ring-opacity-50 rounded-xl transition-all' : ''}
            >
              <FarmCard
                farm={farm}
                allFarms={overview.farms}
                onReassignClick={handleReassignClick}
                onEditClick={() => setBarnModal({ mode: 'edit', farm })}
                onDeleteClick={() => handleDeleteBarn(farm.id, farm.name)}
              />
            </div>
          ))}
        </div>
      )}

      {/* Reassign Modal */}
      {reassignModal && (
        <ReassignStreamModal
          streamId={reassignModal.streamId}
          streamName={reassignModal.streamName}
          currentFarmId={reassignModal.currentFarmId}
          currentFarmName={reassignModal.currentFarmName}
          allFarms={overview.farms}
          onClose={() => setReassignModal(null)}
          onSuccess={handleReassignComplete}
        />
      )}

      {/* Barn Create/Edit Modal */}
      {barnModal && (
        <BarnModal
          mode={barnModal.mode}
          farm={barnModal.farm}
          onClose={() => setBarnModal(null)}
          onSuccess={handleBarnComplete}
        />
      )}
    </div>
  );
};
