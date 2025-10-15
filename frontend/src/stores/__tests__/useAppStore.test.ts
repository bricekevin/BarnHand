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

  describe('Stream Horses Management', () => {
    const mockStreamHorse = {
      id: 'horse-1',
      tracking_id: 'horse_001',
      assigned_color: '#06B6D4',
      confidence_score: 0.95,
      first_detected: '2025-01-15T10:00:00Z',
      last_seen: '2025-01-15T10:05:00Z',
      total_detections: 10,
      status: 'unidentified' as const,
      created_at: '2025-01-15T10:00:00Z',
      updated_at: '2025-01-15T10:05:00Z',
    };

    const mockStreamHorse2 = {
      id: 'horse-2',
      tracking_id: 'horse_002',
      assigned_color: '#10B981',
      confidence_score: 0.88,
      first_detected: '2025-01-15T10:01:00Z',
      last_seen: '2025-01-15T10:06:00Z',
      total_detections: 8,
      status: 'unidentified' as const,
      created_at: '2025-01-15T10:01:00Z',
      updated_at: '2025-01-15T10:06:00Z',
    };

    beforeEach(() => {
      useAppStore.getState().clearStreamHorses();
    });

    it('sets stream horses correctly', () => {
      const { setStreamHorses } = useAppStore.getState();
      const streamId = 'stream-1';

      setStreamHorses(streamId, [mockStreamHorse, mockStreamHorse2]);

      const { streamHorses } = useAppStore.getState();
      expect(streamHorses[streamId]).toHaveLength(2);
      expect(streamHorses[streamId][0]).toEqual(mockStreamHorse);
    });

    it('replaces existing horses for a stream', () => {
      const { setStreamHorses } = useAppStore.getState();
      const streamId = 'stream-1';

      setStreamHorses(streamId, [mockStreamHorse]);
      setStreamHorses(streamId, [mockStreamHorse2]);

      const { streamHorses } = useAppStore.getState();
      expect(streamHorses[streamId]).toHaveLength(1);
      expect(streamHorses[streamId][0].id).toBe('horse-2');
    });

    it('does not affect horses for other streams', () => {
      const { setStreamHorses } = useAppStore.getState();
      const stream1 = 'stream-1';
      const stream2 = 'stream-2';

      setStreamHorses(stream1, [mockStreamHorse]);
      setStreamHorses(stream2, [mockStreamHorse2]);

      const { streamHorses } = useAppStore.getState();
      expect(streamHorses[stream1]).toHaveLength(1);
      expect(streamHorses[stream2]).toHaveLength(1);
      expect(streamHorses[stream1][0].id).toBe('horse-1');
      expect(streamHorses[stream2][0].id).toBe('horse-2');
    });

    it('updates a specific horse in a stream', () => {
      const { setStreamHorses, updateStreamHorse } = useAppStore.getState();
      const streamId = 'stream-1';

      setStreamHorses(streamId, [mockStreamHorse, mockStreamHorse2]);
      updateStreamHorse(streamId, 'horse-1', {
        name: 'Thunder',
        total_detections: 15,
      });

      const { streamHorses } = useAppStore.getState();
      const updatedHorse = streamHorses[streamId].find(h => h.id === 'horse-1');

      expect(updatedHorse?.name).toBe('Thunder');
      expect(updatedHorse?.total_detections).toBe(15);
      expect(updatedHorse?.tracking_id).toBe('horse_001'); // Unchanged
    });

    it('does not update other horses in the stream', () => {
      const { setStreamHorses, updateStreamHorse } = useAppStore.getState();
      const streamId = 'stream-1';

      setStreamHorses(streamId, [mockStreamHorse, mockStreamHorse2]);
      updateStreamHorse(streamId, 'horse-1', { name: 'Thunder' });

      const { streamHorses } = useAppStore.getState();
      const unchangedHorse = streamHorses[streamId].find(h => h.id === 'horse-2');

      expect(unchangedHorse?.name).toBeUndefined();
      expect(unchangedHorse?.total_detections).toBe(8);
    });

    it('adds a new horse to a stream', () => {
      const { setStreamHorses, addStreamHorse } = useAppStore.getState();
      const streamId = 'stream-1';

      setStreamHorses(streamId, [mockStreamHorse]);
      addStreamHorse(streamId, mockStreamHorse2);

      const { streamHorses } = useAppStore.getState();
      expect(streamHorses[streamId]).toHaveLength(2);
      expect(streamHorses[streamId].find(h => h.id === 'horse-2')).toEqual(mockStreamHorse2);
    });

    it('updates existing horse if id matches (upsert behavior)', () => {
      const { setStreamHorses, addStreamHorse } = useAppStore.getState();
      const streamId = 'stream-1';

      setStreamHorses(streamId, [mockStreamHorse]);

      const updatedHorse = {
        ...mockStreamHorse,
        name: 'Thunder',
        total_detections: 15,
        last_seen: '2025-01-15T10:10:00Z',
      };

      addStreamHorse(streamId, updatedHorse);

      const { streamHorses } = useAppStore.getState();
      expect(streamHorses[streamId]).toHaveLength(1); // Still only 1 horse
      expect(streamHorses[streamId][0].name).toBe('Thunder');
      expect(streamHorses[streamId][0].total_detections).toBe(15);
    });

    it('creates stream entry if stream does not exist', () => {
      const { addStreamHorse } = useAppStore.getState();
      const streamId = 'new-stream';

      addStreamHorse(streamId, mockStreamHorse);

      const { streamHorses } = useAppStore.getState();
      expect(streamHorses[streamId]).toBeDefined();
      expect(streamHorses[streamId]).toHaveLength(1);
      expect(streamHorses[streamId][0]).toEqual(mockStreamHorse);
    });

    it('clears horses for a specific stream', () => {
      const { setStreamHorses, clearStreamHorses } = useAppStore.getState();
      const stream1 = 'stream-1';
      const stream2 = 'stream-2';

      setStreamHorses(stream1, [mockStreamHorse]);
      setStreamHorses(stream2, [mockStreamHorse2]);
      clearStreamHorses(stream1);

      const { streamHorses } = useAppStore.getState();
      expect(streamHorses[stream1]).toBeUndefined();
      expect(streamHorses[stream2]).toEqual([mockStreamHorse2]);
    });

    it('clears all stream horses when no streamId provided', () => {
      const { setStreamHorses, clearStreamHorses } = useAppStore.getState();
      const stream1 = 'stream-1';
      const stream2 = 'stream-2';

      setStreamHorses(stream1, [mockStreamHorse]);
      setStreamHorses(stream2, [mockStreamHorse2]);
      clearStreamHorses();

      const { streamHorses } = useAppStore.getState();
      expect(streamHorses).toEqual({});
    });
  });
});