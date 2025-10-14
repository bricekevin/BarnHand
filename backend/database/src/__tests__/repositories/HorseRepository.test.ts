import { query } from '../../connection';
import { HorseRepository } from '../../repositories/HorseRepository';

jest.mock('../../connection', () => ({
  query: jest.fn(),
}));

const mockQuery = query as jest.MockedFunction<typeof query>;

describe('HorseRepository', () => {
  let repository: HorseRepository;

  beforeEach(() => {
    repository = new HorseRepository();
    jest.clearAllMocks();
  });

  describe('findSimilarHorses', () => {
    it('should find horses with similar feature vectors', async () => {
      const featureVector = new Array(512).fill(0.5);
      const threshold = 0.8;
      const maxResults = 5;

      const mockResults = [
        {
          id: '123e4567-e89b-12d3-a456-426614174000',
          name: 'Thunder',
          similarity: 0.85,
          farm_id: 'farm-123',
          breed: 'Thoroughbred',
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      mockQuery.mockResolvedValue({ rows: mockResults });

      const result = await repository.findSimilarHorses(
        featureVector,
        threshold,
        maxResults
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.horse.name).toBe('Thunder');
      expect(result[0]?.similarity).toBe(0.85);
    });
  });

  describe('updateFeatureVector', () => {
    it('should update horse feature vector', async () => {
      const horseId = '123e4567-e89b-12d3-a456-426614174000';
      const featureVector = new Array(512).fill(0.3);

      mockQuery.mockResolvedValue({ rowCount: 1 });

      await repository.updateFeatureVector(horseId, featureVector);

      expect(mockQuery).toHaveBeenCalledWith(
        'UPDATE horses SET feature_vector = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [`[${featureVector.join(',')}]`, horseId]
      );
    });
  });

  describe('incrementDetectionCount', () => {
    it('should increment the detection count', async () => {
      const horseId = '123e4567-e89b-12d3-a456-426614174000';

      mockQuery.mockResolvedValue({ rowCount: 1 });

      await repository.incrementDetectionCount(horseId);

      expect(mockQuery).toHaveBeenCalledWith(
        'UPDATE horses SET total_detections = total_detections + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [horseId]
      );
    });
  });

  describe('findByStreamId', () => {
    it('should find horses for a specific stream', async () => {
      const streamId = 'stream-123';
      const mockResults = [
        {
          id: '123e4567-e89b-12d3-a456-426614174000',
          farm_id: 'farm-123',
          stream_id: streamId,
          name: 'Thunder',
          tracking_id: 'horse_001',
          total_detections: 10,
          confidence_score: 0.9,
          metadata: '{}',
          created_at: new Date(),
          updated_at: new Date(),
          last_seen: new Date(),
        },
        {
          id: '223e4567-e89b-12d3-a456-426614174000',
          farm_id: 'farm-123',
          stream_id: streamId,
          name: 'Lightning',
          tracking_id: 'horse_002',
          total_detections: 5,
          confidence_score: 0.85,
          metadata: '{}',
          created_at: new Date(),
          updated_at: new Date(),
          last_seen: new Date(),
        },
      ];

      mockQuery.mockResolvedValue({ rows: mockResults });

      const result = await repository.findByStreamId(streamId);

      expect(result).toHaveLength(2);
      expect(result[0]?.name).toBe('Thunder');
      expect(result[0]?.stream_id).toBe(streamId);
      expect(result[1]?.name).toBe('Lightning');
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM horses WHERE stream_id = $1 ORDER BY last_seen DESC',
        [streamId]
      );
    });

    it('should return empty array if no horses found for stream', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await repository.findByStreamId('nonexistent-stream');

      expect(result).toHaveLength(0);
    });
  });

  describe('updateAvatar', () => {
    it('should update horse avatar thumbnail', async () => {
      const horseId = '123e4567-e89b-12d3-a456-426614174000';
      const avatarData = Buffer.from('fake-image-data');

      mockQuery.mockResolvedValue({ rowCount: 1 });

      await repository.updateAvatar(horseId, avatarData);

      expect(mockQuery).toHaveBeenCalledWith(
        'UPDATE horses SET avatar_thumbnail = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [avatarData, horseId]
      );
    });

    it('should handle small avatar images (<50KB)', async () => {
      const horseId = '123e4567-e89b-12d3-a456-426614174000';
      // Create a 30KB buffer
      const avatarData = Buffer.alloc(30 * 1024, 'a');

      mockQuery.mockResolvedValue({ rowCount: 1 });

      await repository.updateAvatar(horseId, avatarData);

      expect(mockQuery).toHaveBeenCalled();
      expect(avatarData.length).toBeLessThan(50 * 1024);
    });
  });

  describe('updateHorseDetails', () => {
    it('should update horse name and notes', async () => {
      const horseId = '123e4567-e89b-12d3-a456-426614174000';
      const updates = {
        name: 'Thunder Updated',
        metadata: { notes: 'Very fast horse' },
      };

      const mockResult = {
        id: horseId,
        farm_id: 'farm-123',
        name: 'Thunder Updated',
        total_detections: 10,
        confidence_score: 0.9,
        metadata: '{"notes":"Very fast horse"}',
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockQuery.mockResolvedValue({ rows: [mockResult] });

      const result = await repository.updateHorseDetails(horseId, updates);

      expect(result.name).toBe('Thunder Updated');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE horses'),
        expect.arrayContaining([
          'Thunder Updated',
          JSON.stringify(updates.metadata),
          horseId,
        ])
      );
    });

    it('should only update allowed fields', async () => {
      const horseId = '123e4567-e89b-12d3-a456-426614174000';
      const updates: any = {
        name: 'Thunder',
        breed: 'Thoroughbred',
        age: 5,
        invalid_field: 'should not update',
      };

      const mockResult = {
        id: horseId,
        farm_id: 'farm-123',
        name: 'Thunder',
        breed: 'Thoroughbred',
        age: 5,
        total_detections: 10,
        confidence_score: 0.9,
        metadata: '{}',
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockQuery.mockResolvedValue({ rows: [mockResult] });

      await repository.updateHorseDetails(horseId, updates);

      const callArgs = mockQuery.mock.calls[0];
      expect(callArgs?.[0]).not.toContain('invalid_field');
      expect(callArgs?.[1]).not.toContain('should not update');
    });

    it('should throw error if horse not found', async () => {
      const horseId = 'nonexistent-id';
      const updates = { name: 'Thunder' };

      mockQuery.mockResolvedValue({ rows: [] });

      await expect(
        repository.updateHorseDetails(horseId, updates)
      ).rejects.toThrow(`Horse with id ${horseId} not found`);
    });

    it('should return existing horse if no valid updates provided', async () => {
      const horseId = '123e4567-e89b-12d3-a456-426614174000';
      const mockHorse = {
        id: horseId,
        farm_id: 'farm-123',
        name: 'Thunder',
        total_detections: 10,
        confidence_score: 0.9,
        metadata: '{}',
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockQuery.mockResolvedValue({ rows: [mockHorse] });

      const result = await repository.updateHorseDetails(horseId, {});

      expect(result.id).toBe(horseId);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM horses WHERE id = $1',
        [horseId]
      );
    });
  });

  describe('create with avatar', () => {
    it('should create horse with avatar_thumbnail', async () => {
      const horseData = {
        farm_id: 'farm-123',
        stream_id: 'stream-123',
        name: 'Thunder',
        tracking_id: 'horse_001',
        ui_color: '#FF0000',
        avatar_thumbnail: Buffer.from('fake-image'),
        metadata: { notes: 'Test horse' },
      };

      const mockResult = {
        ...horseData,
        id: '123e4567-e89b-12d3-a456-426614174000',
        total_detections: 0,
        confidence_score: 0,
        metadata: JSON.stringify(horseData.metadata),
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockQuery.mockResolvedValue({ rows: [mockResult] });

      const result = await repository.create(horseData);

      expect(result.name).toBe('Thunder');
      expect(result.stream_id).toBe('stream-123');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO horses'),
        expect.arrayContaining([
          'farm-123',
          'stream-123',
          'Thunder',
          null, // breed
          null, // age
          null, // color
          null, // markings
          null, // gender
          'horse_001',
          '#FF0000',
          horseData.avatar_thumbnail,
          JSON.stringify(horseData.metadata),
        ])
      );
    });

    it('should create horse without avatar_thumbnail', async () => {
      const horseData = {
        farm_id: 'farm-123',
        stream_id: 'stream-123',
        tracking_id: 'horse_001',
        metadata: {},
      };

      const mockResult = {
        ...horseData,
        id: '123e4567-e89b-12d3-a456-426614174000',
        total_detections: 0,
        confidence_score: 0,
        metadata: '{}',
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockQuery.mockResolvedValue({ rows: [mockResult] });

      const result = await repository.create(horseData);

      expect(result.stream_id).toBe('stream-123');
      const callArgs = mockQuery.mock.calls[0];
      expect(callArgs?.[1]).toContain(null); // avatar_thumbnail should be null
    });
  });
});
