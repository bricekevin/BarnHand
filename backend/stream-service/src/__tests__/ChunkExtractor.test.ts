import { ChunkExtractor, StreamSource } from '../services/ChunkExtractor';
import { spawn } from 'child_process';
import fs from 'fs/promises';

// Mock dependencies
jest.mock('child_process');
jest.mock('fs/promises');

const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;
const mockFs = fs as jest.Mocked<typeof fs>;

describe('ChunkExtractor', () => {
  let extractor: ChunkExtractor;
  let mockProcess: any;

  beforeEach(() => {
    extractor = new ChunkExtractor();
    
    // Mock child process
    mockProcess = {
      stdout: { on: jest.fn() },
      stderr: { on: jest.fn() },
      on: jest.fn(),
      kill: jest.fn()
    };
    
    mockSpawn.mockReturnValue(mockProcess as any);
    jest.clearAllMocks();
  });

  describe('extractChunk', () => {
    const mockStreamSource: StreamSource = {
      id: 'test_stream',
      url: 'http://localhost:8003/stream1/playlist.m3u8',
      name: 'Test Stream',
      active: true
    };

    it('should extract chunk successfully', async () => {
      // Setup mocks
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.stat.mockResolvedValue({ size: 1024000 } as any);
      
      // Simulate successful FFmpeg process
      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'close') {
          setTimeout(() => callback(0), 100); // Exit code 0 = success
        }
        return mockProcess;
      });

      const extractPromise = extractor.extractChunk(mockStreamSource, 30);
      
      // Wait a bit then trigger process completion
      setTimeout(() => {
        const closeHandler = mockProcess.on.mock.calls.find(call => call[0] === 'close')?.[1];
        if (closeHandler) closeHandler(0);
      }, 50);

      const result = await extractPromise;

      expect(result).toMatchObject({
        streamId: 'test_stream',
        startTime: 30,
        duration: 10, // Default chunk duration
        status: 'ready',
        size: 1024000
      });
      expect(result.id).toBeDefined();
      expect(result.filename).toContain('test_stream_');
    });

    it('should handle FFmpeg process failure', async () => {
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.unlink.mockResolvedValue(undefined);
      
      // Simulate failed FFmpeg process
      mockProcess.on.mockImplementation((event: string, callback: Function) => {
        if (event === 'close') {
          setTimeout(() => callback(1), 100); // Exit code 1 = failure
        }
        return mockProcess;
      });

      const extractPromise = extractor.extractChunk(mockStreamSource, 30);
      
      // Trigger process failure
      setTimeout(() => {
        const closeHandler = mockProcess.on.mock.calls.find(call => call[0] === 'close')?.[1];
        if (closeHandler) closeHandler(1);
      }, 50);

      await expect(extractPromise).rejects.toThrow('FFmpeg extraction failed with code 1');
      
      // Should attempt to clean up failed file
      expect(mockFs.unlink).toHaveBeenCalled();
    });

    it('should handle process timeout', async () => {
      jest.useFakeTimers();
      mockFs.mkdir.mockResolvedValue(undefined);
      
      // Don't trigger any events (simulate hanging process)
      mockProcess.on.mockReturnValue(mockProcess);

      const extractPromise = extractor.extractChunk(mockStreamSource, 30);
      
      // Fast-forward past timeout
      jest.advanceTimersByTime(30000);

      await expect(extractPromise).rejects.toThrow('Chunk extraction timeout (30s)');
      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
      
      jest.useRealTimers();
    });
  });

  describe('cleanupOldChunks', () => {
    it('should delete chunks older than retention period', async () => {
      const oldTime = Date.now() - (25 * 60 * 60 * 1000); // 25 hours ago
      const recentTime = Date.now() - (5 * 60 * 60 * 1000); // 5 hours ago

      const mockFiles = ['old_chunk.mp4', 'recent_chunk.mp4', 'not_video.txt'];
      mockFs.readdir.mockResolvedValue(mockFiles as any);
      
      mockFs.stat
        .mockResolvedValueOnce({ mtime: new Date(oldTime) } as any)  // old chunk
        .mockResolvedValueOnce({ mtime: new Date(recentTime) } as any); // recent chunk

      mockFs.unlink.mockResolvedValue(undefined);

      const deletedCount = await extractor.cleanupOldChunks();

      expect(deletedCount).toBe(1); // Only old chunk deleted
      expect(mockFs.unlink).toHaveBeenCalledWith(expect.stringContaining('old_chunk.mp4'));
      expect(mockFs.unlink).not.toHaveBeenCalledWith(expect.stringContaining('recent_chunk.mp4'));
    });

    it('should handle cleanup errors gracefully', async () => {
      mockFs.readdir.mockRejectedValue(new Error('Permission denied'));

      const deletedCount = await extractor.cleanupOldChunks();

      expect(deletedCount).toBe(0);
      // Should not throw, should handle error gracefully
    });
  });
});