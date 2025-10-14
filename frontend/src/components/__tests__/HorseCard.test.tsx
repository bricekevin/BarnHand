import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { describe, it, expect, vi } from 'vitest';

import type { Horse } from '../../../../shared/src/types/horse.types';
import { HorseCard } from '../HorseCard';

describe('HorseCard', () => {
  const mockOnClick = vi.fn();

  const mockHorseWithName: Horse = {
    id: 'horse-1',
    farm_id: 'farm-1',
    stream_id: 'stream-1',
    name: 'Thunder',
    breed: 'Thoroughbred',
    age: 5,
    color: 'Bay',
    tracking_id: 'horse_003',
    assigned_color: '#06B6D4',
    status: 'identified',
    confidence_score: 0.95,
    first_detected: '2025-10-14T10:00:00Z',
    last_seen: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
    total_detections: 42,
    avatar_thumbnail: 'base64encodedimage==',
    created_at: '2025-10-14T10:00:00Z',
    updated_at: '2025-10-14T10:30:00Z',
  };

  const mockHorseWithoutName: Horse = {
    id: 'horse-2',
    stream_id: 'stream-1',
    tracking_id: 'horse_007',
    assigned_color: '#10B981',
    status: 'unidentified',
    confidence_score: 0.88,
    first_detected: '2025-10-14T10:15:00Z',
    last_seen: new Date(Date.now() - 30 * 1000).toISOString(), // 30 seconds ago
    total_detections: 1,
    created_at: '2025-10-14T10:15:00Z',
    updated_at: '2025-10-14T10:25:00Z',
  };

  const mockHorseOldSeen: Horse = {
    id: 'horse-3',
    stream_id: 'stream-1',
    tracking_id: 'horse_012',
    assigned_color: '#F59E0B',
    status: 'confirmed',
    confidence_score: 0.92,
    first_detected: '2025-10-01T10:00:00Z',
    last_seen: '2025-10-01T10:00:00Z', // More than 7 days ago
    total_detections: 150,
    created_at: '2025-10-01T10:00:00Z',
    updated_at: '2025-10-01T10:00:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render horse card with all elements', () => {
      render(<HorseCard horse={mockHorseWithName} onClick={mockOnClick} />);

      // Check horse name
      expect(screen.getByText('Thunder')).toBeInTheDocument();

      // Check tracking number badge
      expect(screen.getByText('#3')).toBeInTheDocument();

      // Check detection count
      expect(screen.getByText('42 detections')).toBeInTheDocument();

      // Check status
      expect(screen.getByText('identified')).toBeInTheDocument();
    });

    it('should render horse name when provided', () => {
      render(<HorseCard horse={mockHorseWithName} onClick={mockOnClick} />);

      expect(screen.getByText('Thunder')).toBeInTheDocument();
    });

    it('should render fallback name when name not provided', () => {
      render(<HorseCard horse={mockHorseWithoutName} onClick={mockOnClick} />);

      expect(screen.getByText('Unnamed Horse #7')).toBeInTheDocument();
    });

    it('should render avatar image when avatar_thumbnail provided', () => {
      render(<HorseCard horse={mockHorseWithName} onClick={mockOnClick} />);

      const avatar = screen.getByAltText('Thunder thumbnail');
      expect(avatar).toBeInTheDocument();
      expect(avatar).toHaveAttribute(
        'src',
        'data:image/jpeg;base64,base64encodedimage=='
      );
    });

    it('should render fallback icon when no avatar_thumbnail', () => {
      render(<HorseCard horse={mockHorseWithoutName} onClick={mockOnClick} />);

      // No img element should exist
      const images = screen.queryAllByRole('img');
      expect(images.length).toBe(0);

      // Should have SVG fallback icon
      const svg = document.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('should display tracking ID badge with correct color', () => {
      render(<HorseCard horse={mockHorseWithName} onClick={mockOnClick} />);

      const badge = screen.getByText('#3');
      expect(badge).toHaveStyle({ color: '#06B6D4' });
    });

    it('should display detection count correctly', () => {
      render(<HorseCard horse={mockHorseWithName} onClick={mockOnClick} />);

      expect(screen.getByText('42 detections')).toBeInTheDocument();
    });

    it('should display singular detection for count of 1', () => {
      render(<HorseCard horse={mockHorseWithoutName} onClick={mockOnClick} />);

      expect(screen.getByText('1 detection')).toBeInTheDocument();
    });

    it('should display breed and color when available', () => {
      render(<HorseCard horse={mockHorseWithName} onClick={mockOnClick} />);

      expect(screen.getByText('Thoroughbred • Bay')).toBeInTheDocument();
    });

    it('should not display breed/color row when not available', () => {
      render(<HorseCard horse={mockHorseWithoutName} onClick={mockOnClick} />);

      expect(screen.queryByText(/•/)).not.toBeInTheDocument();
    });
  });

  describe('Time Formatting', () => {
    it('should format recent time as "just now"', () => {
      const recentHorse = {
        ...mockHorseWithoutName,
        last_seen: new Date(Date.now() - 10 * 1000).toISOString(), // 10 seconds ago
      };
      render(<HorseCard horse={recentHorse} onClick={mockOnClick} />);

      expect(screen.getByText('just now')).toBeInTheDocument();
    });

    it('should format time in minutes', () => {
      const minutesAgoHorse = {
        ...mockHorseWithoutName,
        last_seen: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 minutes ago
      };
      render(<HorseCard horse={minutesAgoHorse} onClick={mockOnClick} />);

      expect(screen.getByText('5 minutes ago')).toBeInTheDocument();
    });

    it('should format time in hours', () => {
      render(<HorseCard horse={mockHorseWithName} onClick={mockOnClick} />);

      expect(screen.getByText(/\d+ hour(s)? ago/)).toBeInTheDocument();
    });

    it('should format time in days for older dates', () => {
      const daysAgoHorse = {
        ...mockHorseWithoutName,
        last_seen: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
      };
      render(<HorseCard horse={daysAgoHorse} onClick={mockOnClick} />);

      expect(screen.getByText('3 days ago')).toBeInTheDocument();
    });

    it('should format old dates as full date', () => {
      render(<HorseCard horse={mockHorseOldSeen} onClick={mockOnClick} />);

      // Should display a formatted date like "10/8/2025"
      expect(screen.getByText(/\d{1,2}\/\d{1,2}\/\d{4}/)).toBeInTheDocument();
    });

    it('should use singular form for 1 minute', () => {
      const oneMinuteAgoHorse = {
        ...mockHorseWithoutName,
        last_seen: new Date(Date.now() - 60 * 1000).toISOString(), // 1 minute ago
      };
      render(<HorseCard horse={oneMinuteAgoHorse} onClick={mockOnClick} />);

      expect(screen.getByText('1 minute ago')).toBeInTheDocument();
    });

    it('should use singular form for 1 hour', () => {
      const oneHourAgoHorse = {
        ...mockHorseWithoutName,
        last_seen: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // 1 hour ago
      };
      render(<HorseCard horse={oneHourAgoHorse} onClick={mockOnClick} />);

      expect(screen.getByText('1 hour ago')).toBeInTheDocument();
    });

    it('should use singular form for 1 day', () => {
      const oneDayAgoHorse = {
        ...mockHorseWithoutName,
        last_seen: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
      };
      render(<HorseCard horse={oneDayAgoHorse} onClick={mockOnClick} />);

      expect(screen.getByText('1 day ago')).toBeInTheDocument();
    });
  });

  describe('Tracking Number Extraction', () => {
    it('should extract tracking number from horse_003', () => {
      render(<HorseCard horse={mockHorseWithName} onClick={mockOnClick} />);

      expect(screen.getByText('#3')).toBeInTheDocument();
    });

    it('should extract tracking number from horse_007', () => {
      render(<HorseCard horse={mockHorseWithoutName} onClick={mockOnClick} />);

      expect(screen.getByText('#7')).toBeInTheDocument();
    });

    it('should extract tracking number from horse_012', () => {
      render(<HorseCard horse={mockHorseOldSeen} onClick={mockOnClick} />);

      expect(screen.getByText('#12')).toBeInTheDocument();
    });

    it('should handle tracking_id without numbers', () => {
      const nonstandardHorse = {
        ...mockHorseWithoutName,
        tracking_id: 'H001',
      };
      render(<HorseCard horse={nonstandardHorse} onClick={mockOnClick} />);

      expect(screen.getByText('#1')).toBeInTheDocument();
    });

    it('should fallback to full tracking_id if no numbers', () => {
      const nonstandardHorse = {
        ...mockHorseWithoutName,
        tracking_id: 'HORSE',
      };
      render(<HorseCard horse={nonstandardHorse} onClick={mockOnClick} />);

      expect(screen.getByText('#HORSE')).toBeInTheDocument();
    });
  });

  describe('Interaction', () => {
    it('should call onClick when card is clicked', () => {
      render(<HorseCard horse={mockHorseWithName} onClick={mockOnClick} />);

      const card = screen.getByRole('button', {
        name: 'View details for Thunder',
      });
      fireEvent.click(card);

      expect(mockOnClick).toHaveBeenCalledTimes(1);
    });

    it('should call onClick when Enter key is pressed', () => {
      render(<HorseCard horse={mockHorseWithName} onClick={mockOnClick} />);

      const card = screen.getByRole('button', {
        name: 'View details for Thunder',
      });
      fireEvent.keyDown(card, { key: 'Enter', code: 'Enter' });

      expect(mockOnClick).toHaveBeenCalledTimes(1);
    });

    it('should call onClick when Space key is pressed', () => {
      render(<HorseCard horse={mockHorseWithName} onClick={mockOnClick} />);

      const card = screen.getByRole('button', {
        name: 'View details for Thunder',
      });
      fireEvent.keyDown(card, { key: ' ', code: 'Space' });

      expect(mockOnClick).toHaveBeenCalledTimes(1);
    });

    it('should not call onClick for other keys', () => {
      render(<HorseCard horse={mockHorseWithName} onClick={mockOnClick} />);

      const card = screen.getByRole('button', {
        name: 'View details for Thunder',
      });
      fireEvent.keyDown(card, { key: 'Escape', code: 'Escape' });

      expect(mockOnClick).not.toHaveBeenCalled();
    });

    it('should have correct aria-label for named horse', () => {
      render(<HorseCard horse={mockHorseWithName} onClick={mockOnClick} />);

      expect(
        screen.getByRole('button', { name: 'View details for Thunder' })
      ).toBeInTheDocument();
    });

    it('should have correct aria-label for unnamed horse', () => {
      render(<HorseCard horse={mockHorseWithoutName} onClick={mockOnClick} />);

      expect(
        screen.getByRole('button', {
          name: 'View details for Unnamed Horse #7',
        })
      ).toBeInTheDocument();
    });
  });

  describe('Styling', () => {
    it('should have glass morphism class', () => {
      render(<HorseCard horse={mockHorseWithName} onClick={mockOnClick} />);

      const card = screen.getByRole('button', {
        name: 'View details for Thunder',
      });
      expect(card).toHaveClass('glass');
      expect(card).toHaveClass('bg-slate-900/50');
    });

    it('should have hover transition classes', () => {
      render(<HorseCard horse={mockHorseWithName} onClick={mockOnClick} />);

      const card = screen.getByRole('button', {
        name: 'View details for Thunder',
      });
      expect(card).toHaveClass('transition-all');
      expect(card).toHaveClass('duration-300');
      expect(card).toHaveClass('hover:shadow-glow');
    });

    it('should be keyboard focusable', () => {
      render(<HorseCard horse={mockHorseWithName} onClick={mockOnClick} />);

      const card = screen.getByRole('button', {
        name: 'View details for Thunder',
      });
      expect(card).toHaveAttribute('tabIndex', '0');
    });

    it('should display status indicator dot with assigned color', () => {
      const { container } = render(
        <HorseCard horse={mockHorseWithName} onClick={mockOnClick} />
      );

      // Find status indicator dot
      const statusDot = container.querySelector('.w-2.h-2.rounded-full');
      expect(statusDot).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing optional fields gracefully', () => {
      const minimalHorse: Horse = {
        id: 'horse-minimal',
        stream_id: 'stream-1',
        tracking_id: 'horse_001',
        assigned_color: '#06B6D4',
        status: 'unidentified',
        confidence_score: 0.5,
        first_detected: '2025-10-14T10:00:00Z',
        last_seen: '2025-10-14T10:00:00Z',
        total_detections: 0,
        created_at: '2025-10-14T10:00:00Z',
        updated_at: '2025-10-14T10:00:00Z',
      };

      render(<HorseCard horse={minimalHorse} onClick={mockOnClick} />);

      expect(screen.getByText('Unnamed Horse #1')).toBeInTheDocument();
      expect(screen.getByText('0 detections')).toBeInTheDocument();
    });

    it('should handle very long horse names with truncation', () => {
      const longNameHorse = {
        ...mockHorseWithName,
        name: 'Very Long Horse Name That Should Be Truncated In The UI',
      };
      render(<HorseCard horse={longNameHorse} onClick={mockOnClick} />);

      const nameElement = screen.getByText(longNameHorse.name);
      expect(nameElement).toHaveClass('truncate');
    });

    it('should handle large detection counts', () => {
      const highDetectionHorse = {
        ...mockHorseWithName,
        total_detections: 9999,
      };
      render(<HorseCard horse={highDetectionHorse} onClick={mockOnClick} />);

      expect(screen.getByText('9999 detections')).toBeInTheDocument();
    });
  });
});
