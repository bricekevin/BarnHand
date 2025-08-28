import Hls from 'hls.js';
import React, { useRef, useEffect, useState } from 'react';

interface VideoPlayerProps {
  src: string;
  streamId: string;
  onError?: (error: string) => void;
  onLoad?: () => void;
  className?: string;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  src,
  streamId,
  onError,
  onLoad,
  className = '',
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    setIsLoading(true);
    setError(null);

    // Check if HLS is supported
    if (Hls.isSupported()) {
      // Destroy previous HLS instance
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }

      // Create new HLS instance
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 90,
      });

      hlsRef.current = hls;

      // Load source
      hls.loadSource(src);
      hls.attachMedia(video);

      // Event listeners
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsLoading(false);
        onLoad?.();
        video.play().catch(console.error);
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        console.error('HLS Error:', data);
        const errorMsg = `HLS Error: ${data.type} - ${data.details}`;
        setError(errorMsg);
        setIsLoading(false);
        onError?.(errorMsg);
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS support (Safari)
      video.src = src;
      video.addEventListener('loadedmetadata', () => {
        setIsLoading(false);
        onLoad?.();
      });
      video.addEventListener('error', _e => {
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

    // Video event listeners
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);

    // Cleanup
    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);

      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [src, onError, onLoad]);

  const togglePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video.play().catch(console.error);
    } else {
      video.pause();
    }
  };

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
      className={`relative aspect-video bg-slate-900 rounded-lg overflow-hidden group ${className}`}
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

      {/* Stream Info Overlay */}
      <div className="absolute top-4 left-4 right-4 flex justify-between items-start opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <div className="glass-dark px-3 py-1 rounded-lg">
          <p className="text-xs font-mono text-slate-300">Stream {streamId}</p>
        </div>
        <div className="glass-dark px-2 py-1 rounded-lg">
          <div
            className={`w-2 h-2 rounded-full ${isPlaying ? 'bg-success' : 'bg-amber-500'}`}
          />
        </div>
      </div>

      {/* Play/Pause Overlay */}
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <button
          onClick={togglePlayPause}
          className="w-16 h-16 bg-black/30 hover:bg-black/50 rounded-full flex items-center justify-center transition-colors duration-200"
        >
          {isPlaying ? (
            <svg
              className="w-8 h-8 text-white"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
          ) : (
            <svg
              className="w-8 h-8 text-white"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"
                clipRule="evenodd"
              />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
};
