import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import type { Horse } from '../../../../shared/src/types/horse.types';
import { DetectedHorsesTab } from '../DetectedHorsesTab';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('DetectedHorsesTab', () => {
  const mockStreamId = 'test-stream-123';

  const mockHorses: Horse[] = [
    {
      id: 'horse-1',
      farm_id: 'farm-1',
      stream_id: mockStreamId,
      name: 'Thunder',
      tracking_id: 'H001',
      assigned_color: '#06B6D4',
      status: 'identified',
      confidence_score: 0.95,
      first_detected: '2025-10-14T10:00:00Z',
      last_seen: '2025-10-14T10:30:00Z',
      total_detections: 42,
      avatar_thumbnail: 'base64encodedimage1',
      created_at: '2025-10-14T10:00:00Z',
      updated_at: '2025-10-14T10:30:00Z',
    },
    {
      id: 'horse-2',
      stream_id: mockStreamId,
      tracking_id: 'H002',
      assigned_color: '#10B981',
      status: 'unidentified',
      confidence_score: 0.88,
      first_detected: '2025-10-14T10:15:00Z',
      last_seen: '2025-10-14T10:25:00Z',
      total_detections: 15,
      created_at: '2025-10-14T10:15:00Z',
      updated_at: '2025-10-14T10:25:00Z',
    },
    {
      id: 'horse-3',
      stream_id: mockStreamId,
      name: 'Lightning',
      tracking_id: 'H003',
      assigned_color: '#F59E0B',
      status: 'confirmed',
      confidence_score: 0.92,
      first_detected: '2025-10-14T09:00:00Z',
      last_seen: '2025-10-14T10:35:00Z',
      total_detections: 67,
      created_at: '2025-10-14T09:00:00Z',
      updated_at: '2025-10-14T10:35:00Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Loading State', () => {
    it('should render loading state initially', () => {
      mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves

      render(<DetectedHorsesTab streamId={mockStreamId} />);

      expect(screen.getByText('Detected Horses')).toBeInTheDocument();
      expect(
        screen
          .getAllByRole('generic')
          .some(el => el.classList.contains('animate-pulse'))
      ).toBe(true);
    });

    it('should show loading skeleton when loading', () => {
      mockFetch.mockImplementation(() => new Promise(() => {}));

      render(<DetectedHorsesTab streamId={mockStreamId} />);

      // Check for loading skeleton cards
      const loadingCards = screen
        .getAllByRole('generic')
        .filter(
          el =>
            el.classList.contains('animate-pulse') &&
            el.classList.contains('bg-slate-800/50')
        );
      expect(loadingCards.length).toBeGreaterThan(0);
    });
  });

  describe('Success State', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ horses: mockHorses }),
      });
    });

    it('should fetch and display horses', async () => {
      render(<DetectedHorsesTab streamId={mockStreamId} />);

      await waitFor(() => {
        expect(screen.getByText('Thunder')).toBeInTheDocument();
        expect(screen.getByText('Lightning')).toBeInTheDocument();
        expect(screen.getByText(/Unnamed Horse H002/)).toBeInTheDocument();
      });
    });

    it('should display correct horse count', async () => {
      render(<DetectedHorsesTab streamId={mockStreamId} />);

      await waitFor(() => {
        expect(screen.getByText('(3 horses)')).toBeInTheDocument();
      });
    });

    it('should display horse avatars with correct attributes', async () => {
      render(<DetectedHorsesTab streamId={mockStreamId} />);

      await waitFor(() => {
        const avatarImg = screen.getByAltText('Thunder');
        expect(avatarImg).toHaveAttribute(
          'src',
          'data:image/jpeg;base64,base64encodedimage1'
        );
      });
    });

    it('should display fallback icon when no avatar', async () => {
      render(<DetectedHorsesTab streamId={mockStreamId} />);

      await waitFor(() => {
        // Horse 2 has no avatar, should show SVG icon
        // Check for the presence of the SVG icon specifically within the horse card
        const svgIcons = document.querySelectorAll(
          'svg.w-20.h-20.text-slate-700'
        );
        expect(svgIcons.length).toBeGreaterThan(0);
      });
    });

    it('should display horse tracking ID badges with correct colors', async () => {
      render(<DetectedHorsesTab streamId={mockStreamId} />);

      await waitFor(() => {
        const h001Badge = screen.getByText('H001');
        expect(h001Badge).toHaveStyle({ backgroundColor: '#06B6D4' });
      });
    });

    it('should display detection counts', async () => {
      render(<DetectedHorsesTab streamId={mockStreamId} />);

      await waitFor(() => {
        expect(screen.getByText('42 detections')).toBeInTheDocument();
        expect(screen.getByText('15 detections')).toBeInTheDocument();
        expect(screen.getByText('67 detections')).toBeInTheDocument();
      });
    });

    it('should call API with correct URL', async () => {
      render(<DetectedHorsesTab streamId={mockStreamId} />);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          `http://localhost:8000/api/v1/streams/${mockStreamId}/horses`,
          { credentials: 'include' }
        );
      });
    });
  });

  describe('Empty State', () => {
    it('should display empty state when no horses', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ horses: [] }),
      });

      render(<DetectedHorsesTab streamId={mockStreamId} />);

      await waitFor(() => {
        expect(screen.getByText('No Horses Detected')).toBeInTheDocument();
        expect(
          screen.getByText(/Horses will appear here after they are detected/)
        ).toBeInTheDocument();
      });
    });
  });

  describe('Error State', () => {
    it('should display error state on fetch failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        statusText: 'Internal Server Error',
      });

      render(<DetectedHorsesTab streamId={mockStreamId} />);

      await waitFor(() => {
        expect(screen.getByText('Error Loading Horses')).toBeInTheDocument();
        expect(screen.getByText(/Failed to fetch horses/)).toBeInTheDocument();
      });
    });

    it('should display retry button on error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        statusText: 'Internal Server Error',
      });

      render(<DetectedHorsesTab streamId={mockStreamId} />);

      await waitFor(() => {
        const retryButton = screen.getByText('Retry');
        expect(retryButton).toBeInTheDocument();
      });
    });

    it('should retry fetch when retry button clicked', async () => {
      // First call fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Internal Server Error',
      });

      render(<DetectedHorsesTab streamId={mockStreamId} />);

      await waitFor(() => {
        expect(screen.getByText('Error Loading Horses')).toBeInTheDocument();
      });

      // Second call succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ horses: mockHorses }),
      });

      const retryButton = screen.getByText('Retry');
      fireEvent.click(retryButton);

      await waitFor(() => {
        expect(screen.getByText('Thunder')).toBeInTheDocument();
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('Search Functionality', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ horses: mockHorses }),
      });
    });

    it('should filter horses by name', async () => {
      render(<DetectedHorsesTab streamId={mockStreamId} />);

      await waitFor(() => {
        expect(screen.getByText('Thunder')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(
        /Search horses by name or ID/
      );
      fireEvent.change(searchInput, { target: { value: 'Thunder' } });

      await waitFor(() => {
        expect(screen.getByText('Thunder')).toBeInTheDocument();
        expect(screen.queryByText('Lightning')).not.toBeInTheDocument();
      });
    });

    it('should filter horses by tracking ID', async () => {
      render(<DetectedHorsesTab streamId={mockStreamId} />);

      await waitFor(() => {
        expect(screen.getByText('H002')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(
        /Search horses by name or ID/
      );
      fireEvent.change(searchInput, { target: { value: 'H002' } });

      await waitFor(() => {
        expect(screen.getByText(/Unnamed Horse H002/)).toBeInTheDocument();
        expect(screen.queryByText('Thunder')).not.toBeInTheDocument();
      });
    });

    it('should display no results message when search yields nothing', async () => {
      render(<DetectedHorsesTab streamId={mockStreamId} />);

      await waitFor(() => {
        expect(screen.getByText('Thunder')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(
        /Search horses by name or ID/
      );
      fireEvent.change(searchInput, { target: { value: 'NonexistentHorse' } });

      await waitFor(() => {
        expect(
          screen.getByText(/No horses found matching "NonexistentHorse"/)
        ).toBeInTheDocument();
      });
    });

    it('should be case-insensitive', async () => {
      render(<DetectedHorsesTab streamId={mockStreamId} />);

      await waitFor(() => {
        expect(screen.getByText('Thunder')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(
        /Search horses by name or ID/
      );
      fireEvent.change(searchInput, { target: { value: 'THUNDER' } });

      await waitFor(() => {
        expect(screen.getByText('Thunder')).toBeInTheDocument();
      });
    });
  });

  describe('Sort Functionality', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ horses: mockHorses }),
      });
    });

    it('should sort by recent by default', async () => {
      render(<DetectedHorsesTab streamId={mockStreamId} />);

      await waitFor(() => {
        const sortSelect = screen.getByRole('combobox');
        expect(sortSelect).toHaveValue('recent');
      });
    });

    it('should sort by detection count when selected', async () => {
      render(<DetectedHorsesTab streamId={mockStreamId} />);

      await waitFor(() => {
        expect(screen.getByText('Thunder')).toBeInTheDocument();
      });

      const sortSelect = screen.getByRole('combobox');
      fireEvent.change(sortSelect, { target: { value: 'detections' } });

      await waitFor(() => {
        expect(sortSelect).toHaveValue('detections');
      });

      // Lightning (67) should appear before Thunder (42) when sorted by detections
      const horseNames = screen.getAllByRole('heading', { level: 4 });
      expect(horseNames[0]).toHaveTextContent('Lightning');
    });
  });

  describe('Refresh Functionality', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ horses: mockHorses }),
      });
    });

    it('should refresh horses when refresh button clicked', async () => {
      render(<DetectedHorsesTab streamId={mockStreamId} />);

      await waitFor(() => {
        expect(screen.getByText('Thunder')).toBeInTheDocument();
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);

      const refreshButton = screen.getByRole('button', { name: /Refresh/ });
      fireEvent.click(refreshButton);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('Responsive Grid', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ horses: mockHorses }),
      });
    });

    it('should render horses in a grid layout', async () => {
      render(<DetectedHorsesTab streamId={mockStreamId} />);

      await waitFor(() => {
        const grid = screen.getByText('Thunder').closest('div')
          ?.parentElement?.parentElement;
        expect(grid?.classList.contains('grid')).toBe(true);
      });
    });
  });
});
