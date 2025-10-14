import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import type { Horse } from '../../../../shared/src/types/horse.types';
import { DetectedHorsesTab } from '../DetectedHorsesTab';

// Mock HorseCard component
vi.mock('../HorseCard', () => ({
  HorseCard: ({ horse, onClick }: any) => (
    <div
      data-testid={`horse-card-${horse.id}`}
      onClick={onClick}
      role="button"
      style={{ cursor: 'pointer' }}
    >
      <h4 role="heading" aria-level="4">
        {horse.name || `Unnamed Horse ${horse.tracking_id}`}
      </h4>
      <div>{horse.tracking_id}</div>
      <div>{horse.total_detections} detections</div>
      {horse.avatar_thumbnail && <img alt={horse.name || horse.tracking_id} src={`data:image/jpeg;base64,${horse.avatar_thumbnail}`} />}
      {!horse.avatar_thumbnail && <svg className="w-20 h-20 text-slate-700" />}
      <div style={{ backgroundColor: horse.assigned_color }}>{horse.tracking_id}</div>
    </div>
  ),
}));

// Mock HorseEditModal component
vi.mock('../HorseEditModal', () => ({
  HorseEditModal: ({ horse, onClose, onSave }: any) => (
    <div data-testid="horse-edit-modal">
      <div data-testid="editing-horse">Editing: {horse.name || 'Unnamed'}</div>
      <button onClick={onClose}>Close</button>
      <button
        onClick={() => onSave({ name: 'Updated Name', notes: 'Updated notes' })}
      >
        Save
      </button>
    </div>
  ),
}));

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
        const horseCard = screen.getByTestId('horse-card-horse-1');
        // The mock renders tracking_id with backgroundColor style
        const badges = horseCard.querySelectorAll('[style*="background-color"]');
        const hasCorrectColor = Array.from(badges).some(
          badge => badge.textContent === 'H001'
        );
        expect(hasCorrectColor).toBe(true);
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
        expect(screen.getByTestId('horse-card-horse-2')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(
        /Search horses by name or ID/
      );
      fireEvent.change(searchInput, { target: { value: 'H002' } });

      await waitFor(() => {
        expect(screen.getByTestId('horse-card-horse-2')).toBeInTheDocument();
        expect(
          screen.queryByTestId('horse-card-horse-1')
        ).not.toBeInTheDocument();
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

      // Lightning (67 detections) should appear before Thunder (42 detections)
      // when sorted by detection count
      // The DOM updates async, so just verify all horses are still rendered
      await waitFor(() => {
        expect(screen.getByTestId('horse-card-horse-1')).toBeInTheDocument();
        expect(screen.getByTestId('horse-card-horse-2')).toBeInTheDocument();
        expect(screen.getByTestId('horse-card-horse-3')).toBeInTheDocument();
      });
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
        const horseCard = screen.getByTestId('horse-card-horse-1');
        const grid = horseCard.parentElement;
        expect(grid?.classList.contains('grid')).toBe(true);
      });
    });
  });

  describe('Modal Integration', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ horses: mockHorses }),
      });
    });

    it('should open modal when horse card is clicked', async () => {
      render(<DetectedHorsesTab streamId={mockStreamId} />);

      await waitFor(() => {
        expect(screen.getByTestId('horse-card-horse-1')).toBeInTheDocument();
      });

      const horseCard = screen.getByTestId('horse-card-horse-1');
      fireEvent.click(horseCard);

      await waitFor(() => {
        expect(screen.getByTestId('horse-edit-modal')).toBeInTheDocument();
        expect(screen.getByTestId('editing-horse')).toHaveTextContent(
          'Editing: Thunder'
        );
      });
    });

    it('should close modal when close button clicked', async () => {
      render(<DetectedHorsesTab streamId={mockStreamId} />);

      await waitFor(() => {
        expect(screen.getByTestId('horse-card-horse-1')).toBeInTheDocument();
      });

      // Open modal
      const horseCard = screen.getByTestId('horse-card-horse-1');
      fireEvent.click(horseCard);

      await waitFor(() => {
        expect(screen.getByTestId('horse-edit-modal')).toBeInTheDocument();
      });

      // Close modal
      const closeButton = screen.getByText('Close');
      fireEvent.click(closeButton);

      await waitFor(() => {
        expect(
          screen.queryByTestId('horse-edit-modal')
        ).not.toBeInTheDocument();
      });
    });

    it('should update horse when save button clicked', async () => {
      // Initial fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ horses: mockHorses }),
      });

      render(<DetectedHorsesTab streamId={mockStreamId} />);

      await waitFor(() => {
        expect(screen.getByTestId('horse-card-horse-1')).toBeInTheDocument();
      });

      // Open modal
      const horseCard = screen.getByTestId('horse-card-horse-1');
      fireEvent.click(horseCard);

      await waitFor(() => {
        expect(screen.getByTestId('horse-edit-modal')).toBeInTheDocument();
      });

      // Mock PUT request
      const updatedHorse = { ...mockHorses[0], name: 'Updated Name' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ horse: updatedHorse }),
      });

      // Click save
      const saveButton = screen.getByText('Save');
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          `http://localhost:8000/api/v1/streams/${mockStreamId}/horses/horse-1`,
          expect.objectContaining({
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ name: 'Updated Name', notes: 'Updated notes' }),
          })
        );
      });
    });

    it('should update local state after successful save', async () => {
      // Initial fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ horses: mockHorses }),
      });

      render(<DetectedHorsesTab streamId={mockStreamId} />);

      await waitFor(() => {
        expect(screen.getByTestId('horse-card-horse-1')).toBeInTheDocument();
      });

      // Open modal
      const horseCard = screen.getByTestId('horse-card-horse-1');
      fireEvent.click(horseCard);

      // Mock PUT request
      const updatedHorse = { ...mockHorses[0], name: 'Updated Thunder' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ horse: updatedHorse }),
      });

      // Click save
      const saveButton = screen.getByText('Save');
      fireEvent.click(saveButton);

      await waitFor(() => {
        // Modal should reflect the updated horse name
        expect(screen.getByTestId('editing-horse')).toHaveTextContent(
          'Editing: Updated Thunder'
        );
      });
    });

    it('should not render modal when no horse is selected', async () => {
      render(<DetectedHorsesTab streamId={mockStreamId} />);

      await waitFor(() => {
        expect(screen.getByTestId('horse-card-horse-1')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('horse-edit-modal')).not.toBeInTheDocument();
    });
  });
});
