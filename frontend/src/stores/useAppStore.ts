import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

// Types
interface Stream {
  id: string;
  name: string;
  url: string;
  status: 'active' | 'inactive' | 'processing' | 'error';
  processedUrl?: string;
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

  // Detections
  detections: Detection[];

  // UI State
  selectedStream: string | null;
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
  updateStream: (id: string, updates: Partial<Stream>) => void;
  removeStream: (id: string) => void;
  setActiveStreams: (streamIds: string[]) => void;

  // Horse actions
  addHorse: (horse: Omit<Horse, 'id'>) => void;
  updateHorse: (id: string, updates: Partial<Horse>) => void;
  removeHorse: (id: string) => void;

  // Detection actions
  addDetections: (detections: Detection[]) => void;
  clearDetections: (streamId?: string) => void;

  // UI actions
  setSelectedStream: (streamId: string | null) => void;
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
  detections: [],
  selectedStream: null,
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
    (set, _get) => ({
      ...initialState,

      // Stream actions
      addStream: stream =>
        set(state => ({
          streams: [...state.streams, { ...stream, id: crypto.randomUUID() }],
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

      setActiveStreams: streamIds => set({ activeStreams: streamIds }),

      // Horse actions
      addHorse: horse =>
        set(state => ({
          horses: [...state.horses, { ...horse, id: crypto.randomUUID() }],
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
    }
  )
);

// Selectors
export const useStreams = () => useAppStore(state => state.streams);
export const useActiveStreams = () => useAppStore(state => state.activeStreams);
export const useHorses = () => useAppStore(state => state.horses);
export const useDetections = () => useAppStore(state => state.detections);
export const useSettings = () => useAppStore(state => state.settings);
export const useSelectedStream = () =>
  useAppStore(state => state.selectedStream);
export const useLoading = () => useAppStore(state => state.isLoading);
export const useError = () => useAppStore(state => state.error);
