import React, { useState, useCallback, useRef, useEffect } from 'react';

interface PTZControlsProps {
  streamUrl: string; // RTSP URL like rtsp://utah2025.duckdns.org:8554/12
  streamId?: string; // Stream ID for snapshot proxy
  streamConfig?: {
    // PTZ camera credentials (from database config)
    ptzCredentials?: {
      username: string;
      password: string;
    };
    // PTZ presets (from database config)
    ptzPresets?: {
      [presetNumber: string]: {
        name: string;
        savedAt: string;
      };
    };
    // Legacy support for old format
    username?: string;
    password?: string;
  };
  // Callback to update stream config (triggers parent re-fetch)
  onConfigUpdate?: () => void;
}

interface SavedPreset {
  number: number;
  name: string;
  savedAt: string;
}

// Convert RTSP URL to HTTP PTZ control base URL
// rtsp://utah2025.duckdns.org:8554/12 -> http://utah2025.duckdns.org:8080
const getPTZBaseUrl = (rtspUrl: string): string | null => {
  try {
    const url = new URL(rtspUrl);
    return `http://${url.hostname}:8080`;
  } catch {
    return null;
  }
};

// Get auth token from localStorage
const getAuthToken = (): string => {
  return localStorage.getItem('authToken') || '';
};

export const PTZControls: React.FC<PTZControlsProps> = ({ streamUrl, streamId, streamConfig, onConfigUpdate }) => {
  const [showPopup, setShowPopup] = useState(false);
  const [speed, setSpeed] = useState(45);
  const [presetNumber, setPresetNumber] = useState(0);
  const [savedPresets, setSavedPresets] = useState<SavedPreset[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [snapshotBlobUrl, setSnapshotBlobUrl] = useState<string | null>(null);
  const [isLoadingSnapshot, setIsLoadingSnapshot] = useState(false);

  // Auth credentials for PTZ control (web interface on port 8080)
  // Priority: ptzCredentials from config > localStorage fallback
  const configCreds = streamConfig?.ptzCredentials;
  const [username, setUsername] = useState(configCreds?.username || '');
  const [password, setPassword] = useState(configCreds?.password || '');
  const [showAuthForm, setShowAuthForm] = useState(false);
  const [hasConfigCredentials, setHasConfigCredentials] = useState(!!configCreds?.username);

  const moveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const snapshotIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const baseUrl = getPTZBaseUrl(streamUrl);

  // Fetch snapshot via proxy
  const fetchSnapshot = useCallback(async () => {
    if (!streamId || !username || !password) return;

    try {
      const token = getAuthToken();
      // Pass credentials in query params for backward compat; backend prefers config credentials
      const url = `http://localhost:8000/api/v1/streams/${streamId}/ptz/snapshot?usr=${encodeURIComponent(username)}&pwd=${encodeURIComponent(password)}`;

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Snapshot failed: ${response.status}`);
      }

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);

      // Revoke old blob URL to prevent memory leak
      if (snapshotBlobUrl) {
        URL.revokeObjectURL(snapshotBlobUrl);
      }

      setSnapshotBlobUrl(blobUrl);
      setError(null);
    } catch (err) {
      console.error('Snapshot fetch error:', err);
      if (!error) {
        setError('Failed to load snapshot - check credentials');
      }
    }
  }, [streamId, username, password, snapshotBlobUrl, error]);

  // Load saved presets from config, fallback to localStorage for migration
  useEffect(() => {
    const configPresets = streamConfig?.ptzPresets;
    if (configPresets && Object.keys(configPresets).length > 0) {
      // Convert config presets (object keyed by number) to array format
      const presetsArray: SavedPreset[] = Object.entries(configPresets).map(([num, preset]) => ({
        number: parseInt(num, 10),
        name: preset.name,
        savedAt: preset.savedAt,
      }));
      setSavedPresets(presetsArray);
    } else {
      // Fall back to localStorage (backward compatibility / migration)
      const storedPresets = localStorage.getItem(`ptz_presets_${streamUrl}`);
      if (storedPresets) {
        try {
          setSavedPresets(JSON.parse(storedPresets));
        } catch {
          console.error('Failed to parse saved presets');
        }
      }
    }
  }, [streamUrl, streamConfig?.ptzPresets]);

  // Use config credentials when available, otherwise fall back to localStorage
  useEffect(() => {
    const configCreds = streamConfig?.ptzCredentials;
    if (configCreds?.username) {
      // Use credentials from database config
      setUsername(configCreds.username);
      setPassword(configCreds.password);
      setHasConfigCredentials(true);
    } else {
      // Fall back to localStorage (backward compatibility)
      const storedAuth = localStorage.getItem(`ptz_auth_${streamUrl}`);
      if (storedAuth) {
        try {
          const auth = JSON.parse(storedAuth);
          setUsername(auth.username || '');
          setPassword(auth.password || '');
        } catch {
          console.error('Failed to parse saved auth');
        }
      }
      setHasConfigCredentials(false);
    }
  }, [streamUrl, streamConfig?.ptzCredentials]);

  // Save auth when changed (localStorage fallback - recommend using Stream Settings instead)
  const saveAuth = () => {
    if (!hasConfigCredentials) {
      // Only save to localStorage if not using config credentials
      localStorage.setItem(`ptz_auth_${streamUrl}`, JSON.stringify({ username, password }));
    }
    setShowAuthForm(false);
    // Trigger snapshot refresh with new credentials
    fetchSnapshot();
  };

  // Auto-refresh snapshot every second when popup is open
  useEffect(() => {
    if (!showPopup || !streamId || !username || !password) return;

    // Initial snapshot
    fetchSnapshot();

    // Refresh every 1 second
    snapshotIntervalRef.current = setInterval(() => {
      fetchSnapshot();
    }, 1000);

    return () => {
      if (snapshotIntervalRef.current) {
        clearInterval(snapshotIntervalRef.current);
      }
      // Clean up blob URL when closing
      if (snapshotBlobUrl) {
        URL.revokeObjectURL(snapshotBlobUrl);
      }
    };
  }, [showPopup, streamId, username, password]); // Don't include fetchSnapshot to avoid re-triggering

  // Send PTZ command via proxy to avoid CORS
  const sendPTZCommand = useCallback(async (endpoint: string, params: string) => {
    if (!baseUrl) {
      setError('Invalid stream URL for PTZ control');
      return false;
    }

    // Add authentication to params
    const authParams = username && password
      ? `&-usr=${encodeURIComponent(username)}&-pwd=${encodeURIComponent(password)}`
      : '';

    const fullUrl = `${baseUrl}${endpoint}?${params}${authParams}`;
    console.log('🎮 PTZ Command:', fullUrl);

    try {
      // Try direct fetch first (may fail due to CORS)
      const response = await fetch(fullUrl, {
        method: 'GET',
        mode: 'no-cors',
      });

      setError(null);
      return true;
    } catch (err) {
      console.error('PTZ command failed:', err);
      setError('Failed to send PTZ command - check credentials');
      return false;
    }
  }, [baseUrl, username, password]);

  // Movement commands - continuous while held
  const startMove = useCallback(async (direction: 'up' | 'down' | 'left' | 'right') => {
    await sendPTZCommand(
      '/web/cgi-bin/hi3510/ptzctrl.cgi',
      `-step=0&-act=${direction}&-speed=${speed}`
    );
  }, [sendPTZCommand, speed]);

  const stopMove = useCallback(async () => {
    if (moveTimeoutRef.current) {
      clearTimeout(moveTimeoutRef.current);
      moveTimeoutRef.current = null;
    }
    await sendPTZCommand(
      '/web/cgi-bin/hi3510/ptzctrl.cgi',
      `-step=0&-act=stop&-speed=${speed}`
    );
  }, [sendPTZCommand, speed]);

  // Zoom commands
  const startZoom = useCallback(async (direction: 'zoomin' | 'zoomout') => {
    await sendPTZCommand(
      '/web/cgi-bin/hi3510/ptzctrl.cgi',
      `-step=0&-act=${direction}&-speed=${speed}`
    );
  }, [sendPTZCommand, speed]);

  // Save preset to camera and database
  const savePreset = useCallback(async (number: number) => {
    // First, save to camera
    const success = await sendPTZCommand(
      '/web/cgi-bin/hi3510/param.cgi',
      `cmd=preset&-act=set&-status=1&-number=${number}`
    );

    if (success) {
      const newPreset: SavedPreset = {
        number,
        name: `Preset ${number}`,
        savedAt: new Date().toISOString(),
      };

      const updated = [...savedPresets.filter(p => p.number !== number), newPreset];
      setSavedPresets(updated);

      // Save to database via API if streamId is available
      if (streamId) {
        try {
          const token = getAuthToken();
          // Convert array format to object format for database
          const ptzPresets: { [key: string]: { name: string; savedAt: string } } = {};
          updated.forEach(p => {
            ptzPresets[p.number.toString()] = { name: p.name, savedAt: p.savedAt };
          });

          const response = await fetch(`http://localhost:8000/api/v1/streams/${streamId}`, {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              config: {
                ...streamConfig,
                ptzPresets,
              },
            }),
          });

          if (response.ok) {
            console.log('✅ Preset saved to database');
            onConfigUpdate?.();
          } else {
            console.warn('⚠️ Failed to save preset to database, using localStorage fallback');
            localStorage.setItem(`ptz_presets_${streamUrl}`, JSON.stringify(updated));
          }
        } catch (error) {
          console.warn('⚠️ Network error saving preset, using localStorage fallback:', error);
          localStorage.setItem(`ptz_presets_${streamUrl}`, JSON.stringify(updated));
        }
      } else {
        // Fallback to localStorage if no streamId
        localStorage.setItem(`ptz_presets_${streamUrl}`, JSON.stringify(updated));
      }
    }

    return success;
  }, [sendPTZCommand, savedPresets, streamUrl, streamId, streamConfig, onConfigUpdate]);

  const recallPreset = useCallback(async (number: number) => {
    return await sendPTZCommand(
      '/web/cgi-bin/hi3510/param.cgi',
      `cmd=preset&-act=goto&-status=1&-number=${number}`
    );
  }, [sendPTZCommand]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (moveTimeoutRef.current) clearTimeout(moveTimeoutRef.current);
      if (snapshotIntervalRef.current) clearInterval(snapshotIntervalRef.current);
    };
  }, []);

  // Don't render if URL can't be parsed
  if (!baseUrl) return null;

  // Check if this looks like an RTSP stream that might have PTZ
  const isRtspStream = streamUrl.startsWith('rtsp://');
  if (!isRtspStream) return null;

  return (
    <>
      {/* PTZ Button - Opens popup */}
      <button
        onClick={() => setShowPopup(true)}
        className="flex items-center space-x-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg transition-colors"
      >
        <span className="text-lg">🎮</span>
        <span className="text-sm text-slate-200">PTZ Camera Control</span>
      </button>

      {/* PTZ Popup */}
      {showPopup && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-900 rounded-xl border border-slate-700 w-full max-w-2xl mx-4 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-700">
              <div className="flex items-center space-x-3">
                <span className="text-xl">🎮</span>
                <div>
                  <h3 className="text-lg font-medium text-slate-100">PTZ Camera Control</h3>
                  <p className="text-xs text-slate-400">Live view with direct camera control</p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setShowAuthForm(!showAuthForm)}
                  className={`p-2 rounded-lg transition-colors ${
                    username && password
                      ? 'text-green-400 hover:bg-slate-700'
                      : 'text-amber-400 hover:bg-slate-700'
                  }`}
                  title="Camera Authentication"
                >
                  🔑
                </button>
                <button
                  onClick={() => setShowPopup(false)}
                  className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Auth Form */}
            {showAuthForm && (
              <div className="p-4 bg-slate-800/50 border-b border-slate-700 space-y-3">
                <p className="text-sm text-slate-300">Camera requires authentication:</p>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Username"
                    className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded text-sm text-slate-200"
                  />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded text-sm text-slate-200"
                  />
                  <button
                    onClick={saveAuth}
                    className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded text-sm font-medium"
                  >
                    Save
                  </button>
                </div>
              </div>
            )}

            {/* Error Display */}
            {error && (
              <div className="px-4 py-2 bg-red-500/10 text-red-400 text-sm">
                {error}
              </div>
            )}

            {/* Main Content */}
            <div className="p-4 grid grid-cols-[1fr_auto] gap-4">
              {/* Live Preview - Snapshot from camera */}
              <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
                {snapshotBlobUrl ? (
                  <img
                    src={snapshotBlobUrl}
                    alt="Camera snapshot"
                    className="w-full h-full object-contain"
                  />
                ) : username && password ? (
                  <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-2">
                    <div className="animate-spin w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full"></div>
                    <span className="text-sm">Loading camera...</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-2">
                    <span className="text-4xl">🔑</span>
                    <span className="text-sm">Enter PTZ credentials to see live preview</span>
                    <button
                      onClick={() => setShowAuthForm(true)}
                      className="px-3 py-1 bg-cyan-600 hover:bg-cyan-700 text-white text-sm rounded"
                    >
                      Set Credentials
                    </button>
                  </div>
                )}

                {/* Live indicator */}
                {snapshotBlobUrl && (
                  <div className="absolute top-2 right-2 flex items-center space-x-1 bg-black/50 px-2 py-1 rounded">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                    <span className="text-xs text-white">~1s</span>
                  </div>
                )}
              </div>

              {/* Controls */}
              <div className="space-y-4 w-48">
                {/* Directional Controls */}
                <div className="flex flex-col items-center space-y-1">
                  <span className="text-xs text-slate-400 uppercase tracking-wider mb-1">Direction</span>

                  {/* Up */}
                  <button
                    onMouseDown={() => startMove('up')}
                    onMouseUp={stopMove}
                    onMouseLeave={stopMove}
                    onTouchStart={() => startMove('up')}
                    onTouchEnd={stopMove}
                    className="w-12 h-12 bg-slate-700 hover:bg-slate-600 active:bg-cyan-600 rounded-lg flex items-center justify-center transition-colors"
                  >
                    <svg className="w-6 h-6 text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    </svg>
                  </button>

                  {/* Left, Stop, Right */}
                  <div className="flex items-center space-x-1">
                    <button
                      onMouseDown={() => startMove('left')}
                      onMouseUp={stopMove}
                      onMouseLeave={stopMove}
                      onTouchStart={() => startMove('left')}
                      onTouchEnd={stopMove}
                      className="w-12 h-12 bg-slate-700 hover:bg-slate-600 active:bg-cyan-600 rounded-lg flex items-center justify-center transition-colors"
                    >
                      <svg className="w-6 h-6 text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>

                    <button
                      onClick={stopMove}
                      className="w-12 h-12 bg-red-600/20 hover:bg-red-600/40 border border-red-600/50 rounded-lg flex items-center justify-center transition-colors"
                    >
                      <div className="w-4 h-4 bg-red-500 rounded-sm"></div>
                    </button>

                    <button
                      onMouseDown={() => startMove('right')}
                      onMouseUp={stopMove}
                      onMouseLeave={stopMove}
                      onTouchStart={() => startMove('right')}
                      onTouchEnd={stopMove}
                      className="w-12 h-12 bg-slate-700 hover:bg-slate-600 active:bg-cyan-600 rounded-lg flex items-center justify-center transition-colors"
                    >
                      <svg className="w-6 h-6 text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>

                  {/* Down */}
                  <button
                    onMouseDown={() => startMove('down')}
                    onMouseUp={stopMove}
                    onMouseLeave={stopMove}
                    onTouchStart={() => startMove('down')}
                    onTouchEnd={stopMove}
                    className="w-12 h-12 bg-slate-700 hover:bg-slate-600 active:bg-cyan-600 rounded-lg flex items-center justify-center transition-colors"
                  >
                    <svg className="w-6 h-6 text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>

                {/* Zoom Controls */}
                <div className="flex flex-col items-center space-y-1">
                  <span className="text-xs text-slate-400 uppercase tracking-wider">Zoom</span>
                  <div className="flex items-center space-x-1">
                    <button
                      onMouseDown={() => startZoom('zoomout')}
                      onMouseUp={stopMove}
                      onMouseLeave={stopMove}
                      onTouchStart={() => startZoom('zoomout')}
                      onTouchEnd={stopMove}
                      className="w-14 h-10 bg-slate-700 hover:bg-slate-600 active:bg-cyan-600 rounded-lg flex items-center justify-center transition-colors text-slate-200"
                    >
                      −
                    </button>
                    <button
                      onMouseDown={() => startZoom('zoomin')}
                      onMouseUp={stopMove}
                      onMouseLeave={stopMove}
                      onTouchStart={() => startZoom('zoomin')}
                      onTouchEnd={stopMove}
                      className="w-14 h-10 bg-slate-700 hover:bg-slate-600 active:bg-cyan-600 rounded-lg flex items-center justify-center transition-colors text-slate-200"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Speed */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">Speed</span>
                    <span className="text-xs text-slate-300">{speed}</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="63"
                    value={speed}
                    onChange={(e) => setSpeed(Number(e.target.value))}
                    className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                  />
                </div>
              </div>
            </div>

            {/* Presets Section */}
            <div className="p-4 border-t border-slate-700 space-y-3">
              <span className="text-xs text-slate-400 uppercase tracking-wider">Presets</span>

              <div className="flex items-center space-x-2">
                <select
                  value={presetNumber}
                  onChange={(e) => setPresetNumber(Number(e.target.value))}
                  className="flex-1 bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-slate-200"
                >
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                    <option key={n} value={n}>
                      Preset {n} {savedPresets.find(p => p.number === n) ? '✓' : ''}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => savePreset(presetNumber)}
                  className="px-4 py-2 bg-amber-600/20 text-amber-400 border border-amber-600/30 rounded-lg hover:bg-amber-600/30 transition-colors text-sm"
                >
                  Save
                </button>
                <button
                  onClick={() => recallPreset(presetNumber)}
                  className="px-4 py-2 bg-cyan-600/20 text-cyan-400 border border-cyan-600/30 rounded-lg hover:bg-cyan-600/30 transition-colors text-sm"
                >
                  Go To
                </button>
              </div>

              {/* Quick Preset Buttons */}
              {savedPresets.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {savedPresets.sort((a, b) => a.number - b.number).map(preset => (
                    <button
                      key={preset.number}
                      onClick={() => recallPreset(preset.number)}
                      className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-sm text-slate-300 transition-colors"
                    >
                      #{preset.number}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
