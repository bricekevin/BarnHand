import React, { useState } from 'react';

interface FarmSummary {
  id: string;
  name: string;
  streamCount: number;
  horseCount: number;
}

interface ReassignStreamModalProps {
  streamId: string;
  streamName: string;
  currentFarmId: string;
  currentFarmName: string;
  allFarms: FarmSummary[];
  onClose: () => void;
  onSuccess: () => void;
}

export const ReassignStreamModal: React.FC<ReassignStreamModalProps> = ({
  streamId,
  streamName,
  currentFarmId,
  currentFarmName,
  allFarms,
  onClose,
  onSuccess,
}) => {
  const [selectedFarmId, setSelectedFarmId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter out current farm from options
  const availableFarms = allFarms.filter(f => f.id !== currentFarmId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedFarmId) {
      setError('Please select a target barn');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Authentication required');
      }

      const response = await fetch(`http://localhost:8000/api/v1/settings/streams/${streamId}/farm`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ farmId: selectedFarmId }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Failed to reassign stream: ${response.status}`);
      }

      const result = await response.json();

      // Show success and close
      onSuccess();
    } catch (err) {
      console.error('Error reassigning stream:', err);
      setError(err instanceof Error ? err.message : 'Failed to reassign stream');
    } finally {
      setLoading(false);
    }
  };

  const selectedFarm = availableFarms.find(f => f.id === selectedFarmId);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-slate-900 rounded-xl p-6 w-full max-w-lg mx-4 border border-slate-700">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-display font-bold text-slate-100">
            Reassign Stream to Barn
          </h3>
          <button
            onClick={onClose}
            disabled={loading}
            className="text-slate-400 hover:text-slate-300 transition-colors disabled:opacity-50"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Current Stream Info */}
          <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
            <div className="flex items-center space-x-3 mb-3">
              <div className="text-2xl">📹</div>
              <div>
                <h4 className="text-slate-100 font-medium">{streamName}</h4>
                <p className="text-sm text-slate-400">Currently in: {currentFarmName}</p>
              </div>
            </div>
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
              <div className="flex items-start">
                <svg className="w-5 h-5 text-amber-400 mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div className="text-sm text-amber-300">
                  All horses detected on this stream will be moved to the target barn
                </div>
              </div>
            </div>
          </div>

          {/* Target Barn Selection */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Select Target Barn
            </label>
            {availableFarms.length === 0 ? (
              <div className="bg-slate-800 border border-slate-600 rounded-lg px-4 py-8 text-center">
                <p className="text-slate-400">No other barns available for reassignment</p>
              </div>
            ) : (
              <select
                value={selectedFarmId}
                onChange={e => setSelectedFarmId(e.target.value)}
                disabled={loading}
                className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-3 text-slate-300 focus:outline-none focus:border-cyan-500 disabled:opacity-50"
                required
              >
                <option value="">-- Select a barn --</option>
                {availableFarms.map(farm => (
                  <option key={farm.id} value={farm.id}>
                    {farm.name} ({farm.streamCount} {farm.streamCount === 1 ? 'stream' : 'streams'}, {farm.horseCount} {farm.horseCount === 1 ? 'horse' : 'horses'})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Preview of action */}
          {selectedFarm && (
            <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <svg className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="text-sm text-cyan-300">
                  <strong>This will:</strong>
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>Move "{streamName}" from "{currentFarmName}" to "{selectedFarm.name}"</li>
                    <li>Update all associated horses to belong to "{selectedFarm.name}"</li>
                    <li>Preserve all horse tracking data and detection history</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-error/10 border border-error/30 rounded-lg p-4">
              <div className="flex items-start">
                <svg className="w-5 h-5 text-error mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-error text-sm">{error}</p>
              </div>
            </div>
          )}

          {/* Form Actions */}
          <div className="flex justify-end space-x-3 pt-4 border-t border-slate-700">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="btn-secondary disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !selectedFarmId || availableFarms.length === 0}
              className="btn-primary disabled:opacity-50 flex items-center"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Reassigning...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Confirm Reassignment
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
