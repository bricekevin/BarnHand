// Mock config modules before any imports
jest.mock('../../config/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock the database module before importing the service
const mockHorseRepository = {
  findById: jest.fn(),
  findByStreamId: jest.fn(),
  updateHorseDetails: jest.fn(),
};

const mockStreamRepository = {
  findById: jest.fn(),
};

jest.mock('@barnhand/database', () => ({
  HorseRepository: jest.fn().mockImplementation(() => mockHorseRepository),
  StreamRepository: jest.fn().mockImplementation(() => mockStreamRepository),
}), { virtual: true });

import { streamHorseService } from '../streamHorseService';

describe('StreamHorseService', () => {
  const mockStreamId = 'stream-123';
  const mockFarmId = 'farm-456';
  const mockHorseId = 'horse-789';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getStreamHorses', () => {
    it('should return horses for a valid stream', async () => {
      const mockStream = {
        id: mockStreamId,
        farm_id: mockFarmId,
        name: 'Test Stream',
      };

      const mockHorses = [
        {
          id: 'horse-1',
          farm_id: mockFarmId,
          stream_id: mockStreamId,
          name: 'Thunder',
          tracking_id: 'horse_001',
          total_detections: 10,
          confidence_score: 0.9,
          metadata: {},
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: 'horse-2',
          farm_id: mockFarmId,
          stream_id: mockStreamId,
          name: 'Lightning',
          tracking_id: 'horse_002',
          total_detections: 5,
          confidence_score: 0.85,
          metadata: {},
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      mockStreamRepository.findById.mockResolvedValue(mockStream);
      mockHorseRepository.findByStreamId.mockResolvedValue(mockHorses);

      const result = await streamHorseService.getStreamHorses(mockStreamId, mockFarmId);

      expect(result).toEqual(mockHorses);
      expect(result).toHaveLength(2);
    });

    it('should throw error if stream does not belong to farm', async () => {
      const mockStream = {
        id: mockStreamId,
        farm_id: 'different-farm',
        name: 'Test Stream',
      };

      mockStreamRepository.findById.mockResolvedValue(mockStream);

      await expect(
        streamHorseService.getStreamHorses(mockStreamId, mockFarmId)
      ).rejects.toThrow('does not belong to farm');
    });

    it('should throw error if stream not found', async () => {
      mockStreamRepository.findById.mockResolvedValue(null);

      await expect(
        streamHorseService.getStreamHorses(mockStreamId, mockFarmId)
      ).rejects.toThrow('not found');
    });
  });

  describe('getHorse', () => {
    it('should return horse if belongs to farm', async () => {
      const mockHorse = {
        id: mockHorseId,
        farm_id: mockFarmId,
        stream_id: mockStreamId,
        name: 'Thunder',
        total_detections: 10,
        confidence_score: 0.9,
        metadata: {},
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockHorseRepository.findById.mockResolvedValue(mockHorse);

      const result = await streamHorseService.getHorse(mockHorseId, mockFarmId);

      expect(result).toEqual(mockHorse);
    });

    it('should throw error if horse does not belong to farm', async () => {
      const mockHorse = {
        id: mockHorseId,
        farm_id: 'different-farm',
        name: 'Thunder',
      };

      mockHorseRepository.findById.mockResolvedValue(mockHorse);

      await expect(
        streamHorseService.getHorse(mockHorseId, mockFarmId)
      ).rejects.toThrow('does not belong to farm');
    });

    it('should return null if horse not found', async () => {
      mockHorseRepository.findById.mockResolvedValue(null);

      const result = await streamHorseService.getHorse(mockHorseId, mockFarmId);

      expect(result).toBeNull();
    });
  });

  describe('updateHorse', () => {
    it('should update horse details', async () => {
      const mockHorse = {
        id: mockHorseId,
        farm_id: mockFarmId,
        stream_id: mockStreamId,
        name: 'Thunder',
        total_detections: 10,
        confidence_score: 0.9,
        metadata: {},
        created_at: new Date(),
        updated_at: new Date(),
      };

      const updates = {
        name: 'Thunder Updated',
        metadata: { notes: 'Very fast' },
      };

      const updatedHorse = {
        ...mockHorse,
        ...updates,
      };

      mockHorseRepository.findById.mockResolvedValue(mockHorse);
      mockHorseRepository.updateHorseDetails.mockResolvedValue(updatedHorse);

      const result = await streamHorseService.updateHorse(mockHorseId, mockFarmId, updates);

      expect(result.name).toBe('Thunder Updated');
      expect(result.metadata.notes).toBe('Very fast');
    });

    it('should throw error if horse not found', async () => {
      mockHorseRepository.findById.mockResolvedValue(null);

      await expect(
        streamHorseService.updateHorse(mockHorseId, mockFarmId, { name: 'Test' })
      ).rejects.toThrow('not found');
    });

    it('should throw error if horse does not belong to farm', async () => {
      const mockHorse = {
        id: mockHorseId,
        farm_id: 'different-farm',
        name: 'Thunder',
      };

      mockHorseRepository.findById.mockResolvedValue(mockHorse);

      await expect(
        streamHorseService.updateHorse(mockHorseId, mockFarmId, { name: 'Test' })
      ).rejects.toThrow('does not belong to farm');
    });
  });

  describe('getHorseAvatar', () => {
    it('should return avatar as Buffer', async () => {
      const mockHorse = {
        id: mockHorseId,
        farm_id: mockFarmId,
        avatar_thumbnail: Buffer.from('fake-image').toString('base64'),
      };

      mockHorseRepository.findById.mockResolvedValue(mockHorse);

      const result = await streamHorseService.getHorseAvatar(mockHorseId, mockFarmId);

      expect(result).toBeInstanceOf(Buffer);
      expect(result?.toString()).toBe('fake-image');
    });

    it('should return null if no avatar', async () => {
      const mockHorse = {
        id: mockHorseId,
        farm_id: mockFarmId,
        avatar_thumbnail: undefined,
      };

      mockHorseRepository.findById.mockResolvedValue(mockHorse);

      const result = await streamHorseService.getHorseAvatar(mockHorseId, mockFarmId);

      expect(result).toBeNull();
    });

    it('should throw error if horse does not belong to farm', async () => {
      const mockHorse = {
        id: mockHorseId,
        farm_id: 'different-farm',
      };

      mockHorseRepository.findById.mockResolvedValue(mockHorse);

      await expect(
        streamHorseService.getHorseAvatar(mockHorseId, mockFarmId)
      ).rejects.toThrow('does not belong to farm');
    });
  });

  describe('getStreamHorseSummary', () => {
    it('should return summary with total and recent horses', async () => {
      const mockStream = {
        id: mockStreamId,
        farm_id: mockFarmId,
      };

      const mockHorses = [
        { id: '1', name: 'Horse 1' },
        { id: '2', name: 'Horse 2' },
        { id: '3', name: 'Horse 3' },
        { id: '4', name: 'Horse 4' },
      ];

      mockStreamRepository.findById.mockResolvedValue(mockStream);
      mockHorseRepository.findByStreamId.mockResolvedValue(mockHorses);

      const result = await streamHorseService.getStreamHorseSummary(mockStreamId, mockFarmId);

      expect(result.total).toBe(4);
      expect(result.recent).toHaveLength(3); // Only returns first 3
      expect(result.recent[0]?.name).toBe('Horse 1');
    });
  });
});
