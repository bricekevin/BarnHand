import { query } from '../../connection';
import { CorrectionRepository } from '../../repositories/CorrectionRepository';
import type { CreateCorrectionRequest } from '../../types';

jest.mock('../../connection', () => ({
  query: jest.fn(),
}));

const mockQuery = query as jest.MockedFunction<typeof query>;

describe('CorrectionRepository', () => {
  let repository: CorrectionRepository;

  beforeEach(() => {
    repository = new CorrectionRepository();
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new correction with reassign type', async () => {
      const correction: CreateCorrectionRequest = {
        chunk_id: 'chunk-123',
        detection_index: 5,
        frame_index: 42,
        correction_type: 'reassign',
        original_horse_id: '1_horse_001',
        corrected_horse_id: '1_horse_002',
        user_id: 'user-123',
      };

      const mockResult = {
        id: 'correction-123',
        ...correction,
        created_at: new Date(),
        applied_at: null,
        status: 'pending',
        error_message: null,
        corrected_horse_name: null,
      };

      mockQuery.mockResolvedValue({ rows: [mockResult] });

      const result = await repository.create(correction);

      expect(result.id).toBe('correction-123');
      expect(result.correction_type).toBe('reassign');
      expect(result.status).toBe('pending');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO detection_corrections'),
        [
          correction.chunk_id,
          correction.detection_index,
          correction.frame_index,
          correction.correction_type,
          correction.original_horse_id,
          correction.corrected_horse_id,
          null,
          correction.user_id,
        ]
      );
    });

    it('should create a new_guest correction', async () => {
      const correction: CreateCorrectionRequest = {
        chunk_id: 'chunk-123',
        detection_index: 7,
        frame_index: 55,
        correction_type: 'new_guest',
        original_horse_id: '1_horse_001',
        corrected_horse_name: 'Guest Horse 5',
        user_id: 'user-123',
      };

      const mockResult = {
        id: 'correction-456',
        ...correction,
        created_at: new Date(),
        applied_at: null,
        status: 'pending',
        error_message: null,
        corrected_horse_id: null,
      };

      mockQuery.mockResolvedValue({ rows: [mockResult] });

      const result = await repository.create(correction);

      expect(result.correction_type).toBe('new_guest');
      expect(result.corrected_horse_name).toBe('Guest Horse 5');
    });
  });

  describe('findByChunkId', () => {
    it('should find all corrections for a chunk', async () => {
      const chunkId = 'chunk-123';
      const mockResults = [
        {
          id: 'correction-1',
          chunk_id: chunkId,
          detection_index: 1,
          frame_index: 10,
          correction_type: 'reassign',
          original_horse_id: '1_horse_001',
          corrected_horse_id: '1_horse_002',
          corrected_horse_name: null,
          user_id: 'user-123',
          created_at: new Date(),
          applied_at: null,
          status: 'pending',
          error_message: null,
        },
        {
          id: 'correction-2',
          chunk_id: chunkId,
          detection_index: 5,
          frame_index: 42,
          correction_type: 'mark_incorrect',
          original_horse_id: '1_horse_003',
          corrected_horse_id: null,
          corrected_horse_name: null,
          user_id: 'user-123',
          created_at: new Date(),
          applied_at: new Date(),
          status: 'applied',
          error_message: null,
        },
      ];

      mockQuery.mockResolvedValue({ rows: mockResults });

      const results = await repository.findByChunkId(chunkId);

      expect(results).toHaveLength(2);
      expect(results[0]?.correction_type).toBe('reassign');
      expect(results[1]?.correction_type).toBe('mark_incorrect');
      expect(results[1]?.status).toBe('applied');
    });
  });

  describe('findByChunkIdAndStatus', () => {
    it('should find pending corrections for a chunk', async () => {
      const chunkId = 'chunk-123';
      const mockResults = [
        {
          id: 'correction-1',
          chunk_id: chunkId,
          detection_index: 1,
          frame_index: 10,
          correction_type: 'reassign',
          original_horse_id: '1_horse_001',
          corrected_horse_id: '1_horse_002',
          corrected_horse_name: null,
          user_id: 'user-123',
          created_at: new Date(),
          applied_at: null,
          status: 'pending',
          error_message: null,
        },
      ];

      mockQuery.mockResolvedValue({ rows: mockResults });

      const results = await repository.findByChunkIdAndStatus(chunkId, 'pending');

      expect(results).toHaveLength(1);
      expect(results[0]?.status).toBe('pending');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE chunk_id = $1 AND status = $2'),
        [chunkId, 'pending']
      );
    });
  });

  describe('markApplied', () => {
    it('should mark a correction as applied', async () => {
      const correctionId = 'correction-123';

      mockQuery.mockResolvedValue({ rowCount: 1 });

      await repository.markApplied(correctionId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("SET status = 'applied', applied_at = NOW()"),
        [correctionId]
      );
    });
  });

  describe('markManyApplied', () => {
    it('should mark multiple corrections as applied', async () => {
      const ids = ['correction-1', 'correction-2', 'correction-3'];

      mockQuery.mockResolvedValue({ rowCount: 3 });

      await repository.markManyApplied(ids);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("SET status = 'applied'"),
        [ids]
      );
    });

    it('should handle empty array gracefully', async () => {
      await repository.markManyApplied([]);

      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  describe('deletePending', () => {
    it('should delete all pending corrections for a chunk', async () => {
      const chunkId = 'chunk-123';

      mockQuery.mockResolvedValue({ rowCount: 3 });

      const count = await repository.deletePending(chunkId);

      expect(count).toBe(3);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("WHERE chunk_id = $1 AND status = 'pending'"),
        [chunkId]
      );
    });

    it('should return 0 if no pending corrections', async () => {
      const chunkId = 'chunk-123';

      mockQuery.mockResolvedValue({ rowCount: 0 });

      const count = await repository.deletePending(chunkId);

      expect(count).toBe(0);
    });
  });

  describe('countByChunkId', () => {
    it('should count all corrections for a chunk', async () => {
      const chunkId = 'chunk-123';

      mockQuery.mockResolvedValue({ rows: [{ count: '5' }] });

      const count = await repository.countByChunkId(chunkId);

      expect(count).toBe(5);
    });
  });

  describe('countPendingByChunkId', () => {
    it('should count only pending corrections', async () => {
      const chunkId = 'chunk-123';

      mockQuery.mockResolvedValue({ rows: [{ count: '2' }] });

      const count = await repository.countPendingByChunkId(chunkId);

      expect(count).toBe(2);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("WHERE chunk_id = $1 AND status = 'pending'"),
        [chunkId]
      );
    });
  });

  describe('getUserStats', () => {
    it('should return correction statistics for a user', async () => {
      const userId = 'user-123';

      mockQuery.mockResolvedValue({
        rows: [
          {
            total: '10',
            applied: '7',
            pending: '2',
            failed: '1',
          },
        ],
      });

      const stats = await repository.getUserStats(userId);

      expect(stats.total).toBe(10);
      expect(stats.applied).toBe(7);
      expect(stats.pending).toBe(2);
      expect(stats.failed).toBe(1);
    });
  });

  describe('updateStatus', () => {
    it('should update correction status to failed with error message', async () => {
      const correctionId = 'correction-123';
      const errorMessage = 'Re-processing failed: Invalid chunk';

      mockQuery.mockResolvedValue({ rowCount: 1 });

      await repository.updateStatus(correctionId, 'failed', errorMessage);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SET status = $1, error_message = $2'),
        ['failed', errorMessage, correctionId]
      );
    });
  });
});
