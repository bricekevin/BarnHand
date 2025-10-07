import React, { useRef, useEffect } from 'react';
import Hls from 'hls.js';

interface StreamData {
  id: string;
  name: string;
  url: string;
  status: 'active' | 'inactive' | 'processing' | 'error';
}

interface SimpleVideoPlayerProps {
  stream: StreamData;
}

export const SimpleVideoPlayer: React.FC<SimpleVideoPlayerProps> = ({ stream }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  useEffect(() => {
    if (!videoRef.current || !stream.url) return;

    const video = videoRef.current;

    // Clean up previous HLS instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: false,
        lowLatencyMode: true,
        backBufferLength: 10, // Minimal back buffer for live streams
        maxBufferLength: 20, // Short forward buffer to stay close to live
        maxMaxBufferLength: 30, // Keep maximum buffer small
        liveSyncDurationCount: 1, // Stay very close to live edge (1 segment behind)
        liveMaxLatencyDurationCount: 3, // Maximum 3 segments behind
        liveDurationInfinity: true, // Handle infinite live streams
        manifestLoadingTimeOut: 10000,
        manifestLoadingMaxRetry: 4,
        manifestLoadingRetryDelay: 500,
        fragLoadingTimeOut: 10000, // Shorter timeout for live
        fragLoadingMaxRetry: 6,
        fragLoadingRetryDelay: 500,
        startLevel: -1, // Auto-select quality
        capLevelToPlayerSize: true, // Cap quality to player size
      });

      hlsRef.current = hls;
      hls.loadSource(stream.url);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch((error) => {
          console.log('Auto-play prevented:', error);
        });
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        console.warn('HLS error:', data);
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari native HLS support
      video.src = stream.url;
      video.play().catch((error) => {
        console.log('Auto-play prevented:', error);
      });
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [stream.url, stream.id]);

  return (
    <div className="bg-black rounded-lg overflow-hidden">
      {/* Stream Info Header */}
      <div className="bg-slate-800/90 px-4 py-3 flex items-center justify-between">
        <div>
          <h3 className="text-white font-medium">{stream.name}</h3>
          <p className="text-slate-400 text-sm">Live Stream</p>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${
            stream.status === 'active' ? 'bg-green-400' : 'bg-red-400'
          }`} />
          <span className="text-sm text-slate-300 capitalize">{stream.status}</span>
        </div>
      </div>

      {/* Video Player */}
      <div className="relative aspect-video bg-black">
        <video
          ref={videoRef}
          className="w-full h-full"
          controls
          muted
          playsInline
          autoPlay
        />
      </div>
    </div>
  );
};