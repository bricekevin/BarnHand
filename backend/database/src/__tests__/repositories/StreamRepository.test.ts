import { StreamRepository } from '../../repositories/StreamRepository';
import { query } from '../../connection';

// Mock the database connection
jest.mock('../../connection', () => ({
  query: jest.fn()
}));

const mockQuery = query as jest.MockedFunction<typeof query>;

describe('StreamRepository', () => {
  let repository: StreamRepository;
  
  beforeEach(() => {
    repository = new StreamRepository();
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return all streams when no farmId provided', async () => {
      const mockStreams = [
        {
          id: '123e4567-e89b-12d3-a456-426614174000',
          name: 'Test Stream',
          source_type: 'local',
          source_url: 'http://test.com/stream',
          status: 'active',
          created_at: new Date(),
          updated_at: new Date()
        }
      ];
      
      mockQuery.mockResolvedValue({ rows: mockStreams });
      
      const result = await repository.findAll();
      
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM streams ORDER BY created_at DESC',
        []
      );
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Test Stream');
    });

    it('should filter by farmId when provided', async () => {
      const farmId = '123e4567-e89b-12d3-a456-426614174001';
      mockQuery.mockResolvedValue({ rows: [] });
      
      await repository.findAll(farmId);
      
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM streams WHERE farm_id = $1 ORDER BY created_at DESC',
        [farmId]
      );
    });
  });

  describe('create', () => {
    it('should create a new stream', async () => {
      const streamData = {
        farm_id: '123e4567-e89b-12d3-a456-426614174001',
        name: 'New Stream',
        source_type: 'youtube' as const,
        source_url: 'https://youtube.com/watch?v=test'
      };
      
      const mockCreatedStream = {
        id: '123e4567-e89b-12d3-a456-426614174002',
        ...streamData,
        status: 'inactive',
        processing_delay: 20,
        chunk_duration: 10,
        config: {},
        created_at: new Date(),
        updated_at: new Date()
      };
      
      mockQuery.mockResolvedValue({ rows: [mockCreatedStream] });
      
      const result = await repository.create(streamData);
      
      expect(result.name).toBe('New Stream');
      expect(result.source_type).toBe('youtube');
    });
  });

  describe('updateStatus', () => {
    it('should update stream status', async () => {
      const streamId = '123e4567-e89b-12d3-a456-426614174000';
      const status = 'active';
      
      mockQuery.mockResolvedValue({ rowCount: 1 });
      
      await repository.updateStatus(streamId, status);
      
      expect(mockQuery).toHaveBeenCalledWith(
        'UPDATE streams SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [status, streamId]
      );
    });
  });
});