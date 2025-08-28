import { VideoScanner } from '../services/VideoScanner';
import fs from 'fs/promises';
import path from 'path';

// Mock fs module
jest.mock('fs/promises');
const mockFs = fs as jest.Mocked<typeof fs>;

describe('VideoScanner', () => {
  let scanner: VideoScanner;
  const testMediaPath = '/test/media';

  beforeEach(() => {
    scanner = new VideoScanner(testMediaPath);
    jest.clearAllMocks();
  });

  describe('scanVideos', () => {
    it('should scan and return video files', async () => {
      const mockFiles = ['video1.mp4', 'video2.mov', 'document.txt', 'video3.avi'];
      const mockDirStats = {
        isDirectory: () => true,
        isFile: () => false,
        size: 0,
        mtime: new Date('2024-01-01T00:00:00Z')
      };
      const mockFileStats = {
        isFile: () => true,
        size: 1024000,
        mtime: new Date('2024-01-01T00:00:00Z')
      };

      mockFs.readdir.mockResolvedValue(mockFiles as any);
      // First call for directory check, then calls for each video file
      mockFs.stat
        .mockResolvedValueOnce(mockDirStats as any) // Directory check
        .mockResolvedValue(mockFileStats as any); // File checks

      const result = await scanner.scanVideos();

      expect(result).toHaveLength(3); // Only video files (.mp4, .mov, .avi)
      expect(result[0]).toMatchObject({
        filename: 'video1.mp4',
        size: 1024000,
        lastModified: mockFileStats.mtime
      });
      expect(result[0].id).toBe('video1'); // Generated ID
    });

    it('should handle directory creation when media path does not exist', async () => {
      const notFoundError = new Error('ENOENT');
      (notFoundError as any).code = 'ENOENT';
      
      mockFs.stat.mockRejectedValueOnce(notFoundError);
      mockFs.mkdir.mockResolvedValueOnce(undefined);
      mockFs.readdir.mockResolvedValue([]);

      await scanner.scanVideos();

      expect(mockFs.mkdir).toHaveBeenCalledWith(testMediaPath, { recursive: true });
    });

    it('should filter out non-video files', async () => {
      const mockFiles = ['video.mp4', 'image.jpg', 'document.pdf', 'audio.mp3'];
      const mockDirStats = {
        isDirectory: () => true,
        isFile: () => false,
        size: 0,
        mtime: new Date()
      };
      const mockFileStats = {
        isFile: () => true,
        size: 1024000,
        mtime: new Date()
      };

      mockFs.readdir.mockResolvedValue(mockFiles as any);
      mockFs.stat
        .mockResolvedValueOnce(mockDirStats as any) // Directory check
        .mockResolvedValue(mockFileStats as any); // File checks

      const result = await scanner.scanVideos();

      expect(result).toHaveLength(1); // Only .mp4 file
      expect(result[0].filename).toBe('video.mp4');
    });

    it('should handle file stat errors gracefully', async () => {
      const mockFiles = ['video1.mp4', 'video2.mp4'];
      const mockDirStats = {
        isDirectory: () => true,
        isFile: () => false,
        size: 0,
        mtime: new Date()
      };
      
      mockFs.readdir.mockResolvedValue(mockFiles as any);
      mockFs.stat
        .mockResolvedValueOnce(mockDirStats as any) // Directory check
        .mockRejectedValueOnce(new Error('Permission denied')) // First file fails
        .mockResolvedValueOnce({
          isFile: () => true,
          size: 2048000,
          mtime: new Date()
        } as any); // Second file succeeds

      const result = await scanner.scanVideos();

      expect(result).toHaveLength(1); // Only the successful file
      expect(result[0].filename).toBe('video2.mp4');
    });

    it('should return empty array when scan fails', async () => {
      mockFs.stat.mockRejectedValue(new Error('Permission denied'));

      const result = await scanner.scanVideos();

      expect(result).toEqual([]);
    });
  });
});