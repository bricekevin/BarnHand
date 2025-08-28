import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from '../useAppStore';

// Mock data
const mockStream = {
  id: 'stream1',
  name: 'Test Stream 1',
  url: 'http://localhost:8003/stream1/playlist.m3u8',
  active: false,
  status: 'inactive' as const,
};

const mockHorse = {
  id: 'horse1',
  name: 'Thunder',
  color: '#ff6b35',
  confidence: 0.9,
  lastSeen: new Date().toISOString(),
  isActive: true,
};

const mockDetection = {
  id: 'detection1',
  streamId: 'stream1',
  horseId: 'horse1',
  timestamp: new Date().toISOString(),
  bbox: [100, 100, 200, 200] as [number, number, number, number],
  confidence: 0.85,
  pose: null,
};

describe('useAppStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useAppStore.getState().setStreams([]);
    useAppStore.getState().setHorses([]);
    useAppStore.getState().setDetections([]);
  });

  describe('Streams Management', () => {
    it('sets streams correctly', () => {
      const { setStreams, streams } = useAppStore.getState();
      
      setStreams([mockStream]);
      
      expect(useAppStore.getState().streams).toHaveLength(1);
      expect(useAppStore.getState().streams[0]).toEqual(mockStream);
    });

    it('adds a new stream', () => {
      const { addStream, streams } = useAppStore.getState();
      
      addStream(mockStream);
      
      expect(useAppStore.getState().streams).toHaveLength(1);
      expect(useAppStore.getState().streams[0]).toEqual(mockStream);
    });

    it('toggles stream status', () => {
      const { addStream, toggleStream } = useAppStore.getState();
      
      addStream(mockStream);
      toggleStream('stream1');
      
      const updatedStream = useAppStore.getState().streams[0];
      expect(updatedStream.active).toBe(true);
      
      // Toggle again
      toggleStream('stream1');
      const toggledAgainStream = useAppStore.getState().streams[0];
      expect(toggledAgainStream.active).toBe(false);
    });

    it('updates stream status', () => {
      const { addStream, updateStreamStatus } = useAppStore.getState();
      
      addStream(mockStream);
      updateStreamStatus('stream1', 'processing');
      
      const updatedStream = useAppStore.getState().streams[0];
      expect(updatedStream.status).toBe('processing');
    });

    it('does not toggle non-existent stream', () => {
      const { toggleStream, streams } = useAppStore.getState();
      
      toggleStream('nonexistent');
      
      expect(useAppStore.getState().streams).toHaveLength(0);
    });
  });

  describe('Horses Management', () => {
    it('sets horses correctly', () => {
      const { setHorses } = useAppStore.getState();
      
      setHorses([mockHorse]);
      
      expect(useAppStore.getState().horses).toHaveLength(1);
      expect(useAppStore.getState().horses[0]).toEqual(mockHorse);
    });

    it('adds a new horse', () => {
      const { addHorse } = useAppStore.getState();
      
      addHorse(mockHorse);
      
      expect(useAppStore.getState().horses).toHaveLength(1);
      expect(useAppStore.getState().horses[0]).toEqual(mockHorse);
    });

    it('updates horse name', () => {
      const { addHorse, updateHorseName } = useAppStore.getState();
      
      addHorse(mockHorse);
      updateHorseName('horse1', 'Lightning');
      
      const updatedHorse = useAppStore.getState().horses[0];
      expect(updatedHorse.name).toBe('Lightning');
    });

    it('does not update name for non-existent horse', () => {
      const { updateHorseName } = useAppStore.getState();
      
      updateHorseName('nonexistent', 'NewName');
      
      expect(useAppStore.getState().horses).toHaveLength(0);
    });
  });

  describe('Detections Management', () => {
    it('sets detections correctly', () => {
      const { setDetections } = useAppStore.getState();
      
      setDetections([mockDetection]);
      
      expect(useAppStore.getState().detections).toHaveLength(1);
      expect(useAppStore.getState().detections[0]).toEqual(mockDetection);
    });

    it('adds a new detection', () => {
      const { addDetection } = useAppStore.getState();
      
      addDetection(mockDetection);
      
      expect(useAppStore.getState().detections).toHaveLength(1);
      expect(useAppStore.getState().detections[0]).toEqual(mockDetection);
    });

    it('filters detections by stream', () => {
      const detection2 = { ...mockDetection, id: 'detection2', streamId: 'stream2' };
      const { addDetection, getDetectionsByStream } = useAppStore.getState();
      
      addDetection(mockDetection);
      addDetection(detection2);
      
      const stream1Detections = getDetectionsByStream('stream1');
      expect(stream1Detections).toHaveLength(1);
      expect(stream1Detections[0].streamId).toBe('stream1');
    });

    it('returns empty array for non-existent stream', () => {
      const { getDetectionsByStream } = useAppStore.getState();
      
      const detections = getDetectionsByStream('nonexistent');
      
      expect(detections).toHaveLength(0);
    });
  });

  describe('Settings Management', () => {
    it('updates model settings', () => {
      const { updateModelSettings } = useAppStore.getState();
      
      updateModelSettings({
        selectedModel: 'yolo11',
        confidenceThreshold: 0.7,
        enablePoseDetection: true,
      });
      
      const { settings } = useAppStore.getState();
      expect(settings.selectedModel).toBe('yolo11');
      expect(settings.confidenceThreshold).toBe(0.7);
      expect(settings.enablePoseDetection).toBe(true);
    });

    it('updates stream settings', () => {
      const { updateStreamSettings } = useAppStore.getState();
      
      updateStreamSettings({
        chunkDuration: 15,
        processingDelay: 20,
        outputFormat: 'hls',
      });
      
      const { settings } = useAppStore.getState();
      expect(settings.chunkDuration).toBe(15);
      expect(settings.processingDelay).toBe(20);
      expect(settings.outputFormat).toBe('hls');
    });

    it('updates advanced settings', () => {
      const { updateAdvancedSettings } = useAppStore.getState();
      
      updateAdvancedSettings({
        debugMode: true,
        enableLogging: false,
        maxConcurrentStreams: 5,
      });
      
      const { settings } = useAppStore.getState();
      expect(settings.debugMode).toBe(true);
      expect(settings.enableLogging).toBe(false);
      expect(settings.maxConcurrentStreams).toBe(5);
    });
  });

  describe('Statistics', () => {
    beforeEach(() => {
      const { addStream, addHorse, addDetection } = useAppStore.getState();
      addStream(mockStream);
      addHorse(mockHorse);
      addDetection(mockDetection);
    });

    it('calculates correct statistics', () => {
      const { getStatistics } = useAppStore.getState();
      
      const stats = getStatistics();
      
      expect(stats.totalStreams).toBe(1);
      expect(stats.activeStreams).toBe(0); // mockStream is inactive
      expect(stats.totalHorses).toBe(1);
      expect(stats.activeHorses).toBe(1); // mockHorse is active
      expect(stats.totalDetections).toBe(1);
      expect(stats.averageConfidence).toBe(0.85);
    });

    it('handles empty state gracefully', () => {
      // Reset to empty state
      const { setStreams, setHorses, setDetections, getStatistics } = useAppStore.getState();
      setStreams([]);
      setHorses([]);
      setDetections([]);
      
      const stats = getStatistics();
      
      expect(stats.totalStreams).toBe(0);
      expect(stats.activeStreams).toBe(0);
      expect(stats.totalHorses).toBe(0);
      expect(stats.activeHorses).toBe(0);
      expect(stats.totalDetections).toBe(0);
      expect(stats.averageConfidence).toBe(0);
    });
  });
});