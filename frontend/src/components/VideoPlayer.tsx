import Hls from 'hls.js';
import React, { useRef, useEffect, useState } from 'react';

interface VideoPlayerProps {
  src: string;
  streamId: string;
  onError?: (error: string) => void;
  onLoad?: () => void;
  className?: string;
  onVideoRef?: (ref: React.RefObject<HTMLVideoElement>) => void;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  src,
  streamId,
  onError,
  onLoad,
  className = '',
  onVideoRef,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Expose video ref to parent component
  useEffect(() => {
    if (onVideoRef) {
      onVideoRef(videoRef);
    }
  }, [onVideoRef]);
  const bufferMonitorRef = useRef<NodeJS.Timeout | null>(null);
  const recoveryAttemptRef = useRef(0);

  // Buffer monitoring function
  const startBufferMonitoring = (video: HTMLVideoElement) => {
    if (bufferMonitorRef.current) {
      clearInterval(bufferMonitorRef.current);
    }
    
    bufferMonitorRef.current = setInterval(() => {
      if (!video || video.ended || video.paused) return;
      
      const buffered = video.buffered;
      const currentTime = video.currentTime;
      
      if (buffered.length > 0) {
        const bufferEnd = buffered.end(buffered.length - 1);
        const bufferHealth = bufferEnd - currentTime;
        
        // If buffer health is low and we're not loading
        if (bufferHealth < 2 && !video.seeking) {
          console.log(`Buffer health low: ${bufferHealth}s, checking for stall...`);
          
          // Check if video is actually stalled (not progressing)
          const lastTime = video.dataset.lastCurrentTime ? parseFloat(video.dataset.lastCurrentTime) : 0;
          if (Math.abs(currentTime - lastTime) < 0.1 && recoveryAttemptRef.current < 3) {
            console.log('Video appears stalled, attempting recovery...');
            recoveryAttemptRef.current++;
            
            // Try to recover by seeking slightly forward
            if (bufferEnd > currentTime + 0.1) {
              video.currentTime = Math.min(currentTime + 0.1, bufferEnd - 0.1);
            } else if (hlsRef.current) {
              hlsRef.current.startLoad();
            }
          }
        }
        
        // Store current time for stall detection
        video.dataset.lastCurrentTime = currentTime.toString();
      }
    }, 2000); // Check every 2 seconds
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    setIsLoading(true);
    setError(null);

    // Check if the source is an MP4 file (video chunks)
    const isMP4 = src.toLowerCase().includes('.mp4');

    if (isMP4) {
      // Handle MP4 files directly (video chunks)
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }

      video.src = src;

      video.addEventListener('loadedmetadata', () => {
        setIsLoading(false);
        onLoad?.();

        // Auto-play MP4 chunks
        video.play().catch(error => {
          if (error.name === 'NotAllowedError') {
            console.log('Autoplay prevented by browser policy for MP4');
          } else {
            console.warn('MP4 play error:', error.message);
          }
        });
      });

      video.addEventListener('error', () => {
        const errorMsg = 'MP4 video loading error';
        setError(errorMsg);
        setIsLoading(false);
        onError?.(errorMsg);
      });

      return;
    }

    // Check if HLS is supported (for live streams)
    if (Hls.isSupported()) {
      // Destroy previous HLS instance
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }

      // Create new HLS instance optimized for live streaming
      const hls = new Hls({
        enableWorker: false, // Disable worker for better live stream compatibility
        lowLatencyMode: true, // Enable for live streams
        backBufferLength: 10, // Minimal back buffer for live streams
        maxBufferLength: 20, // Short forward buffer to stay close to live
        maxMaxBufferLength: 30, // Keep maximum buffer small
        liveSyncDurationCount: 1, // Stay very close to live edge (1 segment behind)
        liveMaxLatencyDurationCount: 3, // Maximum 3 segments behind
        liveDurationInfinity: true, // Handle infinite live streams
        maxBufferHole: 0.5, // Allow small gaps
        highBufferWatchdogPeriod: 2, // Check buffer health every 2s
        nudgeOffset: 0.1, // Small nudge for sync
        nudgeMaxRetry: 3, // Retry nudge 3 times
        maxSeekHole: 2, // Allow seeking over 2s gaps
        // Fragment loading settings optimized for live
        fragLoadingTimeOut: 10000, // Shorter timeout for live
        fragLoadingMaxRetry: 6, // More retries for live streams
        fragLoadingRetryDelay: 500, // Quick retry delay
        // Manifest settings
        manifestLoadingTimeOut: 10000, // 10s manifest timeout
        manifestLoadingMaxRetry: 4, // Retry manifest loading
        manifestLoadingRetryDelay: 500, // Quick manifest retry
        startLevel: -1, // Auto-select quality
        capLevelToPlayerSize: true, // Cap quality to player size
      });

      hlsRef.current = hls;

      // Load source
      hls.loadSource(src);
      hls.attachMedia(video);

      // Event listeners
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsLoading(false);
        onLoad?.();
        recoveryAttemptRef.current = 0; // Reset recovery counter

        // More robust video play handling
        const playVideo = async () => {
          try {
            await video.play();
            console.log('Video started playing successfully');
          } catch (error) {
            if (error.name === 'AbortError') {
              console.log('Play request was interrupted, retrying in 500ms...');
              setTimeout(() => {
                if (!video.paused && !video.ended) return;
                video.play().catch(e => console.warn('Retry play failed:', e.message));
              }, 500);
            } else if (error.name === 'NotAllowedError') {
              console.log('Autoplay prevented by browser policy');
            } else {
              console.warn('Video play error:', error.message);
            }
          }
        };

        playVideo();

        // Start buffer monitoring
        startBufferMonitoring(video);
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        console.error('HLS Error:', data);

        if (data.fatal) {
          // Handle fatal errors with recovery
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.log('Network error, attempting to recover...');
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.log('Media error, attempting to recover...');
              hls.recoverMediaError();
              break;
            default:
              // Unrecoverable error
              const errorMsg = `HLS Error: ${data.type} - ${data.details}`;
              setError(errorMsg);
              setIsLoading(false);
              onError?.(errorMsg);
              break;
          }
        } else {
          // Non-fatal errors - just log and continue
          console.warn('HLS Warning:', data.details);
          
          // Special handling for buffer stalled errors
          if (data.details === 'bufferStalledError') {
            console.log('Buffer stalled, attempting recovery...');
            // Try to recover by restarting the load
            setTimeout(() => {
              if (hlsRef.current && !hlsRef.current.media?.ended) {
                hlsRef.current.startLoad();
              }
            }, 1000);
          }
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS support (Safari)
      video.src = src;
      video.addEventListener('loadedmetadata', () => {
        setIsLoading(false);
        onLoad?.();
      });
      video.addEventListener('error', () => {
        const errorMsg = 'Video loading error';
        setError(errorMsg);
        setIsLoading(false);
        onError?.(errorMsg);
      });
    } else {
      const errorMsg = 'HLS not supported in this browser';
      setError(errorMsg);
      setIsLoading(false);
      onError?.(errorMsg);
    }

    // Cleanup
    return () => {
      if (bufferMonitorRef.current) {
        clearInterval(bufferMonitorRef.current);
        bufferMonitorRef.current = null;
      }
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (video) {
        // Remove event listeners and pause video
        video.removeEventListener('loadedmetadata', () => {});
        video.removeEventListener('error', () => {});
        video.pause();
        video.src = '';
      }
    };
  }, [src, onError, onLoad]);


  if (error) {
    return (
      <div
        className={`relative aspect-video bg-slate-800 rounded-lg overflow-hidden ${className}`}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center text-slate-400">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-error/20 flex items-center justify-center">
              <svg
                className="w-6 h-6 text-error"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <p className="text-sm font-medium mb-1">Stream Error</p>
            <p className="text-xs">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative aspect-video bg-slate-900 rounded-lg overflow-hidden ${className}`}
    >
      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-800/50 z-10">
          <div className="text-center text-slate-300">
            <div className="w-8 h-8 mx-auto mb-2 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm">Loading Stream...</p>
          </div>
        </div>
      )}

      {/* Video Element */}
      <video
        ref={videoRef}
        className="w-full h-full object-cover"
        muted
        playsInline
        autoPlay
      />
    </div>
  );
};
