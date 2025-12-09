import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

import type { Horse as StreamHorse } from '../../../shared/src/types/horse.types';

// Types

interface Stream {
  id: string;
  name: string;
  url: string;
  type: 'local' | 'rtsp' | 'rtmp' | 'http';
  status: 'active' | 'inactive' | 'processing' | 'error';
  processedUrl?: string;
  horseCount?: number;
  accuracy?: number;
  lastUpdate?: string;
  config?: {
    username?: string;
    password?: string;
    useAuth?: boolean;
    // PTZ camera credentials
    ptzCredentials?: {
      username: string;
      password: string;
    };
    // PTZ presets
    ptzPresets?: {
      [presetNumber: string]: {
        name: string;
        savedAt: string;
      };
    };
    // Auto-scan settings
    autoScan?: {
      recordingDuration: number;
      frameInterval: number;
      movementDelay: number;
    };
  };
}

interface Horse {
  id: string;
  name?: string;
  color: string;
  confidence: number;
  trackingId: string;
  isActive: boolean;
  lastSeen: Date;
}

interface Detection {
  id: string;
  horseId: string;
  streamId: string;
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  pose?: {
    keypoints: Array<{
      x: number;
      y: number;
      confidence: number;
    }>;
  };
  confidence: number;
  timestamp: Date;
}

interface AppState {
  // Streams
  streams: Stream[];
  activeStreams: string[];

  // Horses
  horses: Horse[];
  activeHorses: string[];

  // Stream Horses (per-stream registry)
  streamHorses: Record<string, StreamHorse[]>;

  // Detections
  detections: Detection[];

  // UI State
  selectedStream: string | null;
  selectedHorse: string | null;
  isLoading: boolean;
  error: string | null;

  // Settings
  settings: {
    confidenceThreshold: number;
    processingDelay: number;
    showPoseOverlay: boolean;
    showTrackingIds: boolean;
    enableDebugMode: boolean;
  };
}

interface AppActions {
  // Stream actions
  addStream: (stream: Omit<Stream, 'id'>) => void;
  addStreamWithId: (id: string, stream: Omit<Stream, 'id'>) => void;
  updateStream: (id: string, updates: Partial<Stream>) => void;
  removeStream: (id: string) => void;
  toggleStream: (id: string) => void;
  setActiveStreams: (streamIds: string[]) => void;

  // Horse actions
  addHorse: (horse: Omit<Horse, 'id'>) => void;
  updateHorse: (id: string, updates: Partial<Horse>) => void;
  removeHorse: (id: string) => void;

  // Stream Horse actions (per-stream registry)
  setStreamHorses: (streamId: string, horses: StreamHorse[]) => void;
  updateStreamHorse: (
    streamId: string,
    horseId: string,
    updates: Partial<StreamHorse>
  ) => void;
  addStreamHorse: (streamId: string, horse: StreamHorse) => void;
  removeStreamHorse: (streamId: string, horseId: string) => void;
  clearStreamHorses: (streamId?: string) => void;

  // Detection actions
  addDetections: (detections: Detection[]) => void;
  clearDetections: (streamId?: string) => void;

  // UI actions
  setSelectedStream: (streamId: string | null) => void;
  setSelectedHorse: (horseId: string | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // Settings actions
  updateSettings: (settings: Partial<AppState['settings']>) => void;

  // Reset
  reset: () => void;
}

type AppStore = AppState & AppActions;

const initialState: AppState = {
  streams: [],
  activeStreams: [],
  horses: [],
  activeHorses: [],
  streamHorses: {},
  detections: [],
  selectedStream: null,
  selectedHorse: null,
  isLoading: false,
  error: null,
  settings: {
    confidenceThreshold: 0.5,
    processingDelay: 15,
    showPoseOverlay: true,
    showTrackingIds: true,
    enableDebugMode: false,
  },
};

export const useAppStore = create<AppStore>()(
  devtools(
    persist(
      (set, _get) => ({
        ...initialState,

        // Stream actions
        addStream: stream =>
          set(state => ({
            streams: [
              ...state.streams,
              {
                ...stream,
                id: `stream-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              },
            ],
          })),

        addStreamWithId: (id, stream) =>
          set(state => ({
            streams: state.streams.find(s => s.id === id)
              ? state.streams // Stream already exists, don't add duplicate
              : [...state.streams, { ...stream, id }],
          })),

        updateStream: (id, updates) =>
          set(state => ({
            streams: state.streams.map(stream =>
              stream.id === id ? { ...stream, ...updates } : stream
            ),
          })),

        removeStream: id =>
          set(state => ({
            streams: state.streams.filter(stream => stream.id !== id),
            activeStreams: state.activeStreams.filter(
              streamId => streamId !== id
            ),
          })),

        setStreams: streams =>
          set({ streams }),

        toggleStream: id =>
          set(state => ({
            streams: state.streams.map(stream =>
              stream.id === id
                ? {
                    ...stream,
                    status: stream.status === 'active' ? 'inactive' : 'active',
                  }
                : stream
            ),
          })),

        setActiveStreams: streamIds => set({ activeStreams: streamIds }),

        // Horse actions
        addHorse: horse =>
          set(state => ({
            horses: [
              ...state.horses,
              {
                ...horse,
                id: `horse-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              },
            ],
          })),

        updateHorse: (id, updates) =>
          set(state => ({
            horses: state.horses.map(horse =>
              horse.id === id ? { ...horse, ...updates } : horse
            ),
          })),

        removeHorse: id =>
          set(state => ({
            horses: state.horses.filter(horse => horse.id !== id),
          })),

        // Stream Horse actions (per-stream registry)
        setStreamHorses: (streamId, horses) =>
          set(state => ({
            streamHorses: {
              ...state.streamHorses,
              [streamId]: horses,
            },
          })),

        updateStreamHorse: (streamId, horseId, updates) =>
          set(state => ({
            streamHorses: {
              ...state.streamHorses,
              [streamId]: (state.streamHorses[streamId] || []).map(horse =>
                horse.id === horseId ? { ...horse, ...updates } : horse
              ),
            },
          })),

        addStreamHorse: (streamId, horse) =>
          set(state => {
            const currentHorses = state.streamHorses[streamId] || [];
            // Check if horse already exists (by id)
            const existingIndex = currentHorses.findIndex(
              h => h.id === horse.id
            );

            if (existingIndex >= 0) {
              // Update existing horse
              const updatedHorses = [...currentHorses];
              updatedHorses[existingIndex] = horse;
              return {
                streamHorses: {
                  ...state.streamHorses,
                  [streamId]: updatedHorses,
                },
              };
            } else {
              // Add new horse
              return {
                streamHorses: {
                  ...state.streamHorses,
                  [streamId]: [...currentHorses, horse],
                },
              };
            }
          }),

        removeStreamHorse: (streamId, horseId) =>
          set(state => ({
            streamHorses: {
              ...state.streamHorses,
              [streamId]: (state.streamHorses[streamId] || []).filter(
                horse => horse.id !== horseId
              ),
            },
          })),

        clearStreamHorses: streamId =>
          set(state => {
            if (streamId) {
              const { [streamId]: _, ...rest } = state.streamHorses;
              return { streamHorses: rest };
            }
            return { streamHorses: {} };
          }),

        // Detection actions
        addDetections: detections =>
          set(state => ({
            detections: [...state.detections, ...detections].slice(-1000), // Keep last 1000 detections
          })),

        clearDetections: streamId =>
          set(state => ({
            detections: streamId
              ? state.detections.filter(
                  detection => detection.streamId !== streamId
                )
              : [],
          })),

        // UI actions
        setSelectedStream: streamId => set({ selectedStream: streamId }),

        setSelectedHorse: horseId => set({ selectedHorse: horseId }),

        setLoading: loading => set({ isLoading: loading }),

        setError: error => set({ error }),

        // Settings actions
        updateSettings: settings =>
          set(state => ({
            settings: { ...state.settings, ...settings },
          })),

        // Reset
        reset: () => set(initialState),
      }),
      {
        name: 'barnhand-store',
        partialize: state => ({
          streams: state.streams,
          settings: state.settings,
        }),
      }
    ),
    {
      name: 'barnhand-devtools',
    }
  )
);

// Stable empty array to prevent infinite loops
const EMPTY_HORSE_ARRAY: StreamHorse[] = [];

// Selectors
export const useStreams = () => useAppStore(state => state.streams);
export const useActiveStreams = () => useAppStore(state => state.activeStreams);
export const useHorses = () => useAppStore(state => state.horses);
export const useStreamHorses = (streamId: string) =>
  useAppStore(
    state => state.streamHorses[streamId] || EMPTY_HORSE_ARRAY,
    (a, b) => {
      // Custom equality function to prevent infinite loops
      if (a === b) return true; // Same reference
      if (!a || !b) return false;
      if (a.length !== b.length) return false;
      // Compare horse IDs for shallow equality
      return a.every((horse, i) => horse.id === b[i]?.id);
    }
  );
export const useDetections = () => useAppStore(state => state.detections);
export const useSettings = () => useAppStore(state => state.settings);
export const useSelectedStream = () =>
  useAppStore(state => state.selectedStream);
export const useSelectedHorse = () => useAppStore(state => state.selectedHorse);
export const useLoading = () => useAppStore(state => state.isLoading);
export const useError = () => useAppStore(state => state.error);
