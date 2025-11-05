// Mock config modules before any imports
jest.mock('../../config/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock global fetch
global.fetch = jest.fn();

// Mock redis client
const mockRedisClient = {
  connect: jest.fn().mockResolvedValue(undefined),
  get: jest.fn(),
  set: jest.fn(),
  on: jest.fn(),
};

jest.mock('redis', () => ({
  createClient: jest.fn(() => mockRedisClient),
}));

// Mock the database module before importing the service
const mockCorrectionRepository = {
  create: jest.fn(),
  findByChunkId: jest.fn(),
  findByChunkIdAndStatus: jest.fn(),
  countByChunkId: jest.fn(),
  countPendingByChunkId: jest.fn(),
  deletePending: jest.fn(),
  updateStatus: jest.fn(),
};

const mockHorseRepository = {
  findByIdAnyStatus: jest.fn(),
};

jest.mock(
  '@barnhand/database',
  () => ({
    CorrectionRepository: jest
      .fn()
      .mockImplementation(() => mockCorrectionRepository),
    HorseRepository: jest.fn().mockImplementation(() => mockHorseRepository),
  }),
  { virtual: true }
);

import { correctionService } from '../correctionService';
import type { CorrectionPayload } from '../correctionService';

const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

describe('CorrectionService', () => {
  const mockChunkId = 'chunk-123';
  const mockStreamId = 'stream-456';
  const mockUserId = 'user-789';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validateCorrection', () => {
    it('should validate a correct reassign correction', async () => {
      const correction: CorrectionPayload = {
        detection_index: 5,
        frame_index: 42,
        correction_type: 'reassign',
        original_horse_id: '1_horse_001',
        corrected_horse_id: '1_horse_002',
      };

      mockHorseRepository.findByIdAnyStatus.mockResolvedValue({
        id: '1_horse_002',
        name: 'Thunder',
      });

      const result = await correctionService['validateCorrection'](
        correction,
        mockChunkId
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject reassign without corrected_horse_id', async () => {
      const correction: CorrectionPayload = {
        detection_index: 5,
        frame_index: 42,
        correction_type: 'reassign',
        original_horse_id: '1_horse_001',
      };

      const result = await correctionService['validateCorrection'](
        correction,
        mockChunkId
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Reassign correction requires corrected_horse_id');
    });

    it('should reject reassign to same horse', async () => {
      const correction: CorrectionPayload = {
        detection_index: 5,
        frame_index: 42,
        correction_type: 'reassign',
        original_horse_id: '1_horse_001',
        corrected_horse_id: '1_horse_001', // Same horse!
      };

      const result = await correctionService['validateCorrection'](
        correction,
        mockChunkId
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Cannot reassign detection to the same horse');
    });

    it('should reject reassign to non-existent horse', async () => {
      const correction: CorrectionPayload = {
        detection_index: 5,
        frame_index: 42,
        correction_type: 'reassign',
        original_horse_id: '1_horse_001',
        corrected_horse_id: '1_horse_999', // Doesn't exist
      };

      mockHorseRepository.findByIdAnyStatus.mockResolvedValue(null);

      const result = await correctionService['validateCorrection'](
        correction,
        mockChunkId
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Target horse 1_horse_999 does not exist');
    });

    it('should validate new_guest correction', async () => {
      const correction: CorrectionPayload = {
        detection_index: 7,
        frame_index: 55,
        correction_type: 'new_guest',
        original_horse_id: '1_horse_001',
        corrected_horse_name: 'Guest Horse 5',
      };

      const result = await correctionService['validateCorrection'](
        correction,
        mockChunkId
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject new_guest without corrected_horse_name', async () => {
      const correction: CorrectionPayload = {
        detection_index: 7,
        frame_index: 55,
        correction_type: 'new_guest',
        original_horse_id: '1_horse_001',
      };

      const result = await correctionService['validateCorrection'](
        correction,
        mockChunkId
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('New guest correction requires corrected_horse_name');
    });

    it('should validate mark_incorrect correction', async () => {
      const correction: CorrectionPayload = {
        detection_index: 3,
        frame_index: 20,
        correction_type: 'mark_incorrect',
        original_horse_id: '1_horse_001',
      };

      const result = await correctionService['validateCorrection'](
        correction,
        mockChunkId
      );

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject negative detection_index', async () => {
      const correction: CorrectionPayload = {
        detection_index: -1,
        frame_index: 42,
        correction_type: 'mark_incorrect',
        original_horse_id: '1_horse_001',
      };

      const result = await correctionService['validateCorrection'](
        correction,
        mockChunkId
      );

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('detection_index must be >= 0');
    });
  });

  describe('submitCorrections', () => {
    it('should successfully submit valid corrections', async () => {
      const corrections: CorrectionPayload[] = [
        {
          detection_index: 1,
          frame_index: 10,
          correction_type: 'reassign',
          original_horse_id: '1_horse_001',
          corrected_horse_id: '1_horse_002',
        },
        {
          detection_index: 5,
          frame_index: 42,
          correction_type: 'new_guest',
          original_horse_id: '1_horse_003',
          corrected_horse_name: 'Guest Horse 5',
        },
      ];

      mockHorseRepository.findByIdAnyStatus.mockResolvedValue({
        id: '1_horse_002',
        name: 'Thunder',
      });

      mockCorrectionRepository.create.mockImplementation((data: any) =>
        Promise.resolve({
          id: 'correction-' + data.detection_index,
          ...data,
          status: 'pending',
          created_at: new Date(),
        })
      );

      mockFetch.mockResolvedValue({
        ok: true,
        status: 202,
        json: async () => ({}),
      } as Response);

      const result = await correctionService.submitCorrections(
        mockStreamId,
        mockChunkId,
        corrections,
        mockUserId
      );

      expect(result.corrections_count).toBe(2);
      expect(result.chunk_id).toBe(mockChunkId);
      expect(result.message).toContain('Corrections queued');
      expect(mockCorrectionRepository.create).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/reprocess/chunk/'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ corrections }),
        })
      );
    });

    it('should reject invalid corrections', async () => {
      const corrections: CorrectionPayload[] = [
        {
          detection_index: 1,
          frame_index: 10,
          correction_type: 'reassign',
          original_horse_id: '1_horse_001',
          // Missing corrected_horse_id!
        },
      ];

      await expect(
        correctionService.submitCorrections(
          mockStreamId,
          mockChunkId,
          corrections,
          mockUserId
        )
      ).rejects.toThrow('Invalid correction');
    });

    it('should mark corrections as failed if ML service call fails', async () => {
      const corrections: CorrectionPayload[] = [
        {
          detection_index: 1,
          frame_index: 10,
          correction_type: 'mark_incorrect',
          original_horse_id: '1_horse_001',
        },
      ];

      mockCorrectionRepository.create.mockResolvedValue({
        id: 'correction-123',
        chunk_id: mockChunkId,
        status: 'pending',
      });

      mockFetch.mockRejectedValue(new Error('ML service unavailable'));

      await expect(
        correctionService.submitCorrections(
          mockStreamId,
          mockChunkId,
          corrections,
          mockUserId
        )
      ).rejects.toThrow('Failed to trigger re-processing');

      expect(mockCorrectionRepository.updateStatus).toHaveBeenCalledWith(
        'correction-123',
        'failed',
        expect.stringContaining('ML service')
      );
    });
  });

  describe('getReprocessingStatus', () => {
    it('should return status from Redis if available', async () => {
      const mockStatus = {
        status: 'running',
        progress: 45,
        step: 'Regenerating frames...',
        started_at: new Date().toISOString(),
      };

      mockRedisClient.get.mockResolvedValue(JSON.stringify(mockStatus));

      const result = await correctionService.getReprocessingStatus(mockChunkId);

      expect(result.chunk_id).toBe(mockChunkId);
      expect(result.status).toBe('running');
      expect(result.progress).toBe(45);
      expect(result.current_step).toContain('Regenerating');
    });

    it('should fallback to database if Redis unavailable', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      mockCorrectionRepository.countPendingByChunkId.mockResolvedValue(2);
      mockCorrectionRepository.countByChunkId.mockResolvedValue(2);

      const result = await correctionService.getReprocessingStatus(mockChunkId);

      expect(result.status).toBe('pending');
      expect(result.progress).toBe(0);
    });

    it('should return completed status when all corrections applied', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      mockCorrectionRepository.countPendingByChunkId.mockResolvedValue(0);
      mockCorrectionRepository.countByChunkId.mockResolvedValue(5);

      const result = await correctionService.getReprocessingStatus(mockChunkId);

      expect(result.status).toBe('completed');
      expect(result.progress).toBe(100);
    });

    it('should return idle status when no corrections exist', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      mockCorrectionRepository.countPendingByChunkId.mockResolvedValue(0);
      mockCorrectionRepository.countByChunkId.mockResolvedValue(0);

      const result = await correctionService.getReprocessingStatus(mockChunkId);

      expect(result.status).toBe('idle');
      expect(result.progress).toBe(0);
    });
  });

  describe('cancelPendingCorrections', () => {
    it('should cancel pending corrections', async () => {
      mockCorrectionRepository.deletePending.mockResolvedValue(3);

      const result = await correctionService.cancelPendingCorrections(mockChunkId);

      expect(result).toBe(3);
      expect(mockCorrectionRepository.deletePending).toHaveBeenCalledWith(mockChunkId);
    });
  });

  describe('getChunkCorrections', () => {
    it('should return correction history for chunk', async () => {
      const mockCorrections = [
        {
          id: 'correction-1',
          chunk_id: mockChunkId,
          correction_type: 'reassign',
          status: 'applied',
        },
        {
          id: 'correction-2',
          chunk_id: mockChunkId,
          correction_type: 'new_guest',
          status: 'pending',
        },
      ];

      mockCorrectionRepository.findByChunkId.mockResolvedValue(mockCorrections);

      const result = await correctionService.getChunkCorrections(mockChunkId);

      expect(result).toHaveLength(2);
      expect(result[0]?.id).toBe('correction-1');
      expect(mockCorrectionRepository.findByChunkId).toHaveBeenCalledWith(mockChunkId);
    });
  });
});
