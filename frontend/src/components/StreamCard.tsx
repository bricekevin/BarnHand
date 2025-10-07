import React, { useState } from 'react';

// import { OverlayCanvas } from './OverlayCanvas';
import { VideoPlayer } from './VideoPlayer';
import { useAppStore } from '../stores/useAppStore';

interface StreamCardProps {
  stream: {
    id: string;
    name: string;
    url: string;
    status: 'active' | 'inactive' | 'processing' | 'error';
  };
  thumbnail?: boolean;
}

export const StreamCard: React.FC<StreamCardProps> = ({ stream, thumbnail = false }) => {
  const { selectedStream, setSelectedStream } = useAppStore();
  const isSelected = selectedStream === stream.id;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent bubbling to parent
    setSelectedStream(stream.id);
  };


  if (thumbnail) {
    return (
      <div 
        onClick={handleClick}
        className={`cursor-pointer transition-all duration-200 rounded-lg overflow-hidden ${
          isSelected 
            ? 'ring-2 ring-cyan-400 ring-offset-2 ring-offset-slate-950' 
            : 'hover:ring-2 hover:ring-slate-600 hover:ring-offset-2 hover:ring-offset-slate-950'
        }`}
      >
        <div className="relative aspect-video bg-black">
          {stream.status === 'active' ? (
            <VideoPlayer
              src={stream.url}
              streamId={stream.id}
              className="w-full h-full object-cover"
              onLoad={() => {}}
              onError={(error) => console.error('Video error:', error)}
            />
          ) : (
            <div className="flex items-center justify-center h-full bg-slate-900 text-slate-400">
              <div className="text-center">
                <div className="w-8 h-8 mx-auto mb-2 rounded-full bg-slate-700/50 flex items-center justify-center">
                  <svg
                    className="w-4 h-4"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path d="M2 6a2 2 0 012-2h6l2 2h6a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM5 8a1 1 0 000 2h8a1 1 0 100-2H5z" />
                  </svg>
                </div>
                <p className="text-xs">No Signal</p>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div 
      onClick={handleClick}
      className="stream-card glass bg-slate-900/50 border border-slate-700/50 rounded-xl overflow-hidden transition-all duration-300 hover:transform hover:-translate-y-1 hover:shadow-glow cursor-pointer">

      {/* Video Container */}
      <div className="relative aspect-video bg-black overflow-hidden">
        {stream.status === 'active' ? (
          <>
            <VideoPlayer
              src={stream.url}
              streamId={stream.id}
              className="w-full h-full object-cover"
              onLoad={() => {}}
              onError={(error) => console.error('Video error:', error)}
            />
            {/* TODO: Re-enable OverlayCanvas when video streaming is working */}
            {/* <OverlayCanvas
              videoRef={videoRef}
              className="absolute inset-0 pointer-events-none"
              detections={[]}
            /> */}
          </>
        ) : (
          <div className="flex items-center justify-center h-full bg-slate-900 text-slate-400">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-700/50 flex items-center justify-center">
                <svg
                  className="w-8 h-8"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M2 6a2 2 0 012-2h6l2 2h6a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM5 8a1 1 0 000 2h8a1 1 0 100-2H5z" />
                </svg>
              </div>
              <p className="text-sm">No Signal</p>
            </div>
          </div>
        )}


      </div>

    </div>
  );
};
