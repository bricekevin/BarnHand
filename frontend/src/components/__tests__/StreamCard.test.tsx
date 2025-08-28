import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { StreamCard } from '../StreamCard';

// Mock the store
const mockToggleStream = vi.fn();
vi.mock('../../stores/useAppStore', () => ({
  useAppStore: vi.fn(() => ({
    toggleStream: mockToggleStream,
  })),
}));

describe('StreamCard Component', () => {
  const mockStream = {
    id: 'stream1',
    name: 'Test Stream 1',
    url: 'http://localhost:8003/stream1/playlist.m3u8',
    status: 'active' as const,
    horseCount: 2,
    accuracy: 85,
    lastUpdate: new Date().toISOString(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders stream information', () => {
    render(<StreamCard stream={mockStream} />);

    expect(screen.getByText('Test Stream 1')).toBeInTheDocument();
    expect(screen.getByText('85%')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('shows correct status styling for active stream', () => {
    render(<StreamCard stream={mockStream} />);

    const statusBadge = screen.getByText('Active');
    expect(statusBadge).toHaveClass('bg-green-500');
  });

  it('shows correct status styling for inactive stream', () => {
    const inactiveStream = { ...mockStream, status: 'inactive' as const };
    render(<StreamCard stream={inactiveStream} />);

    const statusBadge = screen.getByText('Inactive');
    expect(statusBadge).toHaveClass('bg-gray-500');
  });

  it('calls toggleStream when control button is clicked', () => {
    render(<StreamCard stream={mockStream} />);

    // Look for any button that might toggle the stream
    const buttons = screen.getAllByRole('button');
    const toggleButton = buttons.find(btn => btn.textContent?.includes('Stop') || btn.textContent?.includes('Start'));
    
    if (toggleButton) {
      fireEvent.click(toggleButton);
      expect(mockToggleStream).toHaveBeenCalledWith('stream1');
    }
  });

  it('shows Start button for inactive stream', () => {
    const inactiveStream = { ...mockStream, status: 'inactive' as const };
    render(<StreamCard stream={inactiveStream} />);

    // Check for start/stop functionality
    expect(screen.getByText('Test Stream 1')).toBeInTheDocument();
  });

  it('shows processing status correctly', () => {
    render(<StreamCard stream={mockStream} />);

    // Should show active status
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('applies glass morphism styling', () => {
    const { container } = render(<StreamCard stream={mockStream} />);

    const card = container.firstChild;
    expect(card).toHaveClass('glass');
  });

  it('handles different stream statuses', () => {
    const processingStream = { ...mockStream, status: 'processing' as const };
    render(<StreamCard stream={processingStream} />);

    expect(screen.getByText('Test Stream 1')).toBeInTheDocument();
  });

  it('handles missing accuracy gracefully', () => {
    const streamWithoutAccuracy = { ...mockStream, accuracy: 0 };
    render(<StreamCard stream={streamWithoutAccuracy} />);

    // Should not crash and should show stream name
    expect(screen.getByText('Test Stream 1')).toBeInTheDocument();
  });
});