import React, { useState, useEffect } from 'react';
import { FarmCard } from './FarmCard';
import { ReassignStreamModal } from './ReassignStreamModal';

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

interface StreamManagementOverview {
  farms: FarmSummary[];
}

interface ReassignModalData {
  streamId: string;
  streamName: string;
  currentFarmId: string;
  currentFarmName: string;
}

export const StreamBarnManagement: React.FC = () => {
  const [overview, setOverview] = useState<StreamManagementOverview>({ farms: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reassignModal, setReassignModal] = useState<ReassignModalData | null>(null);

  useEffect(() => {
    fetchStreamManagementOverview();
  }, []);

  const fetchStreamManagementOverview = async () => {
    try {
      setLoading(true);
      setError(null);

      const token = localStorage.getItem('authToken');
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
            <FarmCard
              key={farm.id}
              farm={farm}
              allFarms={overview.farms}
              onReassignClick={handleReassignClick}
            />
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
    </div>
  );
};
