import { HorseRepository } from '../../repositories/HorseRepository';
import { query } from '../../connection';

jest.mock('../../connection', () => ({
  query: jest.fn()
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
          updated_at: new Date()
        }
      ];
      
      mockQuery.mockResolvedValue({ rows: mockResults });
      
      const result = await repository.findSimilarHorses(featureVector, threshold, maxResults);
      
      expect(result).toHaveLength(1);
      expect(result[0].horse.name).toBe('Thunder');
      expect(result[0].similarity).toBe(0.85);
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
});