import React from 'react';

import type { Horse } from '../../../shared/src/types/horse.types';

interface HorseCardProps {
  horse: Horse;
  onClick: () => void; // Opens the horse details modal
}

/**
 * HorseCard - Display component for individual horse in registry grid
 *
 * Features:
 * - Avatar display with fallback icon
 * - Tracking ID badge with assigned color
 * - Horse name or "Unnamed Horse #X" fallback
 * - Last seen relative timestamp
 * - Total detection count
 * - Glass morphism styling with hover effects
 */
export const HorseCard: React.FC<HorseCardProps> = ({ horse, onClick }) => {
  // Format relative time (e.g., "2 minutes ago", "3 hours ago")
  const formatRelativeTime = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return 'just now';
    if (diffMin < 60) return `${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`;
    if (diffHour < 24)
      return `${diffHour} hour${diffHour !== 1 ? 's' : ''} ago`;
    if (diffDay < 7) return `${diffDay} day${diffDay !== 1 ? 's' : ''} ago`;

    return date.toLocaleDateString();
  };

  // Extract tracking number from tracking_id (e.g., "horse_003" -> "3")
  const getTrackingNumber = (trackingId: string): string => {
    const match = trackingId.match(/\d+$/);
    return match ? parseInt(match[0], 10).toString() : trackingId;
  };

  const trackingNumber = getTrackingNumber(horse.tracking_id);
  const horseName = horse.name || `Unnamed Horse #${trackingNumber}`;
  const lastSeenText = formatRelativeTime(horse.last_seen);
  const hasAvatar = Boolean(horse.avatar_thumbnail);

  return (
    <div
      onClick={onClick}
      className="horse-card glass bg-slate-900/50 border border-slate-700/50 rounded-xl overflow-hidden transition-all duration-300 hover:transform hover:-translate-y-1 hover:shadow-glow cursor-pointer"
      role="button"
      tabIndex={0}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      aria-label={`View details for ${horseName}`}
    >
      {/* Avatar Container */}
      <div className="relative aspect-square bg-slate-900 overflow-hidden">
        {hasAvatar ? (
          <img
            src={`data:image/jpeg;base64,${horse.avatar_thumbnail}`}
            alt={`${horseName} thumbnail`}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          // Fallback horse silhouette icon
          <div className="flex items-center justify-center h-full bg-gradient-to-br from-slate-800 to-slate-900 text-slate-600">
            <svg
              className="w-16 h-16"
              fill="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Horse silhouette icon */}
              <path d="M20 8h-2.81c-.45-.78-1.07-1.45-1.82-1.96L17 4.41 15.59 3l-2.17 2.17C12.96 5.06 12.49 5 12 5c-.49 0-.96.06-1.42.17L8.41 3 7 4.41l1.62 1.63C7.88 6.55 7.26 7.22 6.81 8H4v2h2.09c-.05.33-.09.66-.09 1v1H4v2h2v1c0 .34.04.67.09 1H4v2h2.81c1.04 1.79 2.97 3 5.19 3s4.15-1.21 5.19-3H20v-2h-2.09c.05-.33.09-.66.09-1v-1h2v-2h-2v-1c0-.34-.04-.67-.09-1H20V8zm-6 8h-4v-2h4v2zm0-4h-4v-2h4v2z" />
            </svg>
          </div>
        )}

        {/* Tracking ID Badge - Top Left */}
        <div className="absolute top-2 left-2 flex items-center gap-1">
          <div
            className="px-2 py-1 rounded-md text-xs font-bold shadow-md backdrop-blur-sm"
            style={{
              backgroundColor: `${horse.assigned_color}20`,
              borderColor: horse.assigned_color,
              borderWidth: '2px',
              color: horse.assigned_color,
            }}
          >
            #{trackingNumber}
          </div>
          {/* Guest Horse Indicator */}
          {horse.is_official === false && (
            <div
              className="px-2 py-1 rounded-md text-xs font-medium shadow-md backdrop-blur-sm bg-amber-500/20 text-amber-400 border-2 border-amber-500/50"
              title="Guest horse (not an official barn horse)"
            >
              Guest
            </div>
          )}
          {/* Official Horse Indicator */}
          {horse.is_official === true && (
            <div
              className="px-2 py-1 rounded-md text-xs font-medium shadow-md backdrop-blur-sm bg-emerald-500/20 text-emerald-400 border-2 border-emerald-500/50"
              title="Official barn horse"
            >
              ✓
            </div>
          )}
        </div>

        {/* Detection Count Badge - Top Right */}
        <div className="absolute top-2 right-2 px-2 py-1 rounded-md text-xs font-medium bg-slate-900/80 text-slate-200 backdrop-blur-sm border border-slate-700/50">
          {horse.total_detections} detection
          {horse.total_detections !== 1 ? 's' : ''}
        </div>

      </div>

      {/* Card Content */}
      <div className="p-4 space-y-2">
        {/* Horse Name */}
        <h3
          className="text-base font-semibold text-slate-100 truncate"
          title={horseName}
        >
          {horseName}
        </h3>

        {/* Metadata Row */}
        <div className="flex items-center justify-between text-xs text-slate-400">
          {/* Last Seen */}
          <div className="flex items-center gap-1">
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>{lastSeenText}</span>
          </div>

          {/* Status Indicator */}
          <div className="flex items-center gap-1">
            <div
              className="w-2 h-2 rounded-full"
              style={{
                backgroundColor: horse.assigned_color,
                boxShadow: `0 0 4px ${horse.assigned_color}`,
              }}
            />
            <span className="capitalize">{horse.status}</span>
          </div>
        </div>

        {/* Stream and Barn Information */}
        {(horse.stream_name || horse.farm_name) && (
          <div className="text-xs text-slate-500 truncate flex items-center gap-1">
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 1 011-1h2a1 1 1 011 1v5m-4 0h4"
              />
            </svg>
            <span>
              {[horse.stream_name, horse.farm_name]
                .filter(Boolean)
                .join(' • ')}
            </span>
          </div>
        )}

        {/* Optional: Breed/Color if available */}
        {(horse.breed || horse.color) && (
          <div className="text-xs text-slate-500 truncate">
            {[horse.breed, horse.color].filter(Boolean).join(' • ')}
          </div>
        )}
      </div>
    </div>
  );
};
