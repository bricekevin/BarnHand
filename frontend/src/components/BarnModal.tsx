import React, { useState, useEffect } from 'react';

interface Farm {
  id: string;
  name: string;
  location?: any;
  timezone?: string;
  metadata?: Record<string, any>;
  expected_horse_count?: number;
}

interface BarnModalProps {
  mode: 'create' | 'edit';
  farm?: Farm; // Only required for edit mode
  onClose: () => void;
  onSuccess: () => void;
}

export const BarnModal: React.FC<BarnModalProps> = ({
  mode,
  farm,
  onClose,
  onSuccess,
}) => {
  const [name, setName] = useState(farm?.name || '');
  const [timezone, setTimezone] = useState(farm?.timezone || 'UTC');
  const [expectedHorseCount, setExpectedHorseCount] = useState(farm?.expected_horse_count || 0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (farm) {
      setName(farm.name);
      setTimezone(farm.timezone || 'UTC');
      setExpectedHorseCount(farm.expected_horse_count || 0);
    }
  }, [farm]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setError('Barn name is required');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const token = localStorage.getItem('authToken');
      if (!token) {
        setError('Authentication required - please log in');
        setLoading(false);
        return;
      }

      const url =
        mode === 'create'
          ? 'http://localhost:8000/api/v1/settings/farms'
          : `http://localhost:8000/api/v1/settings/farms/${farm?.id}`;

      const method = mode === 'create' ? 'POST' : 'PUT';

      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name.trim(),
          timezone,
          expected_horse_count: expectedHorseCount,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(
          data.error || `Failed to ${mode} barn: ${response.status}`
        );
      }

      await response.json();

      // Show success and close
      onSuccess();
    } catch (err) {
      console.error(`Error ${mode}ing barn:`, err);
      setError(err instanceof Error ? err.message : `Failed to ${mode} barn`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-slate-900 rounded-xl p-6 w-full max-w-lg mx-4 border border-slate-700">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-display font-bold text-slate-100">
            {mode === 'create' ? 'Create New Barn' : 'Edit Barn'}
          </h3>
          <button
            onClick={onClose}
            disabled={loading}
            className="text-slate-400 hover:text-slate-300 transition-colors disabled:opacity-50"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Barn Name */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Barn Name <span className="text-error">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g., Main Barn, South Paddock"
              disabled={loading}
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-3 text-slate-300 placeholder-slate-500 focus:outline-none focus:border-cyan-500 disabled:opacity-50"
              required
              maxLength={100}
            />
          </div>

          {/* Expected Horse Count */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Expected Number of Horses
            </label>
            <input
              type="number"
              value={expectedHorseCount}
              onChange={e => setExpectedHorseCount(Math.max(0, parseInt(e.target.value) || 0))}
              placeholder="0"
              disabled={loading}
              min="0"
              max="999"
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-3 text-slate-300 placeholder-slate-500 focus:outline-none focus:border-cyan-500 disabled:opacity-50"
            />
            <p className="text-xs text-slate-500 mt-1">
              Sets the capacity for Re-ID matching. Used to prevent over-detection by limiting unique horses to this number.
            </p>
          </div>

          {/* Timezone */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Timezone
            </label>
            <select
              value={timezone}
              onChange={e => setTimezone(e.target.value)}
              disabled={loading}
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-3 text-slate-300 focus:outline-none focus:border-cyan-500 disabled:opacity-50"
            >
              <option value="UTC">UTC</option>
              <option value="America/New_York">Eastern Time (ET)</option>
              <option value="America/Chicago">Central Time (CT)</option>
              <option value="America/Denver">Mountain Time (MT)</option>
              <option value="America/Los_Angeles">Pacific Time (PT)</option>
              <option value="Europe/London">London (GMT)</option>
              <option value="Europe/Paris">Central European Time (CET)</option>
              <option value="Asia/Tokyo">Japan (JST)</option>
              <option value="Australia/Sydney">Sydney (AEDT)</option>
            </select>
            <p className="text-xs text-slate-500 mt-1">
              Used for scheduling and timestamp display
            </p>
          </div>

          {/* Info Box */}
          <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <svg
                className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div className="text-sm text-cyan-300">
                {mode === 'create' ? (
                  <>
                    <strong>What is a barn?</strong>
                    <p className="mt-1">
                      Barns group video streams and horses together. Each stream
                      is assigned to a barn, and horse Re-ID happens within the
                      barn's pool of horses.
                    </p>
                  </>
                ) : (
                  <>
                    <strong>Note:</strong>
                    <p className="mt-1">
                      Updating the barn name will not affect existing streams or
                      horses assigned to this barn.
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-error/10 border border-error/30 rounded-lg p-4">
              <div className="flex items-start">
                <svg
                  className="w-5 h-5 text-error mr-2 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
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
              disabled={loading || !name.trim()}
              className="btn-primary disabled:opacity-50 flex items-center"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  {mode === 'create' ? 'Creating...' : 'Updating...'}
                </>
              ) : (
                <>
                  <svg
                    className="w-4 h-4 mr-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  {mode === 'create' ? 'Create Barn' : 'Update Barn'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
