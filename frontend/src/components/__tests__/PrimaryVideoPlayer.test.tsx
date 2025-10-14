import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { PrimaryVideoPlayer } from '../PrimaryVideoPlayer';

// Mock child components
vi.mock('../VideoPlayer', () => ({
  VideoPlayer: vi.fn(({ onVideoRef }) => {
    // Simulate calling onVideoRef with a mock ref
    const mockRef = { current: document.createElement('video') };
    if (onVideoRef) onVideoRef(mockRef);
    return <div data-testid="video-player">Video Player</div>;
  }),
}));

vi.mock('../OverlayCanvas', () => ({
  OverlayCanvas: vi.fn(() => <div data-testid="overlay-canvas">Overlay</div>),
}));

vi.mock('../DetectionDataPanel', () => ({
  DetectionDataPanel: vi.fn(() => (
    <div data-testid="detection-panel">Detection Data</div>
  )),
}));

vi.mock('../DetectedHorsesTab', () => ({
  DetectedHorsesTab: vi.fn(({ streamId }) => (
    <div data-testid="detected-horses-tab">Detected Horses: {streamId}</div>
  )),
}));

// Mock fetch
global.fetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    json: () =>
      Promise.resolve({
        accessToken: 'test-token',
        chunks: [],
      }),
  })
) as any;

describe('PrimaryVideoPlayer', () => {
  const mockStream = {
    id: 'stream-123',
    name: 'Test Stream',
    url: 'http://localhost:8003/stream1/index.m3u8',
    status: 'active' as const,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('Tab Navigation', () => {
    it('renders all three tabs', () => {
      render(<PrimaryVideoPlayer stream={mockStream} />);

      expect(screen.getByText(/Live Stream/i)).toBeInTheDocument();
      expect(screen.getByText(/Recorded Chunks/i)).toBeInTheDocument();
      expect(screen.getByText(/Detected Horses/i)).toBeInTheDocument();
    });

    it('defaults to Live Stream tab', () => {
      render(<PrimaryVideoPlayer stream={mockStream} />);

      const liveButton = screen.getByText(/Live Stream/i).closest('button');
      expect(liveButton).toHaveClass('bg-red-500/20');
    });

    it('switches to Detected Horses tab when clicked', async () => {
      render(<PrimaryVideoPlayer stream={mockStream} />);

      const horsesButton = screen
        .getByText(/Detected Horses/i)
        .closest('button');
      fireEvent.click(horsesButton!);

      await waitFor(() => {
        expect(horsesButton).toHaveClass('bg-cyan-500/20');
      });
    });

    it('displays DetectedHorsesTab when horses tab is active', async () => {
      render(<PrimaryVideoPlayer stream={mockStream} />);

      const horsesButton = screen
        .getByText(/Detected Horses/i)
        .closest('button');
      fireEvent.click(horsesButton!);

      await waitFor(() => {
        expect(screen.getByTestId('detected-horses-tab')).toBeInTheDocument();
      });
    });

    it('passes correct streamId to DetectedHorsesTab', async () => {
      render(<PrimaryVideoPlayer stream={mockStream} />);

      const horsesButton = screen
        .getByText(/Detected Horses/i)
        .closest('button');
      fireEvent.click(horsesButton!);

      await waitFor(() => {
        const horsesTab = screen.getByTestId('detected-horses-tab');
        expect(horsesTab).toHaveTextContent('Detected Horses: stream-123');
      });
    });

    it('switches from Live to Detected Horses tab', async () => {
      render(<PrimaryVideoPlayer stream={mockStream} />);

      // Initially on Live tab
      const liveButton = screen.getByText(/Live Stream/i).closest('button');
      expect(liveButton).toHaveClass('bg-red-500/20');

      // Click Detected Horses tab
      const horsesButton = screen
        .getByText(/Detected Horses/i)
        .closest('button');
      fireEvent.click(horsesButton!);

      await waitFor(() => {
        expect(horsesButton).toHaveClass('bg-cyan-500/20');
        expect(liveButton).not.toHaveClass('bg-red-500/20');
      });
    });

    it('does not render DetectedHorsesTab when on Live tab', () => {
      render(<PrimaryVideoPlayer stream={mockStream} />);

      expect(
        screen.queryByTestId('detected-horses-tab')
      ).not.toBeInTheDocument();
    });

    it('does not render DetectedHorsesTab when on Playback tab', async () => {
      render(<PrimaryVideoPlayer stream={mockStream} />);

      const playbackButton = screen
        .getByText(/Recorded Chunks/i)
        .closest('button');
      fireEvent.click(playbackButton!);

      await waitFor(() => {
        expect(playbackButton).toHaveClass('bg-blue-500/20');
      });

      expect(
        screen.queryByTestId('detected-horses-tab')
      ).not.toBeInTheDocument();
    });
  });

  describe('Tab Icons', () => {
    it('displays user icon for Detected Horses tab', () => {
      render(<PrimaryVideoPlayer stream={mockStream} />);

      const horsesButton = screen
        .getByText(/Detected Horses/i)
        .closest('button');
      const svg = horsesButton?.querySelector('svg');

      expect(svg).toBeInTheDocument();
      expect(svg).toHaveClass('w-4', 'h-4');
    });
  });

  describe('Tab Switching Behavior', () => {
    it('can switch between all three tabs', async () => {
      render(<PrimaryVideoPlayer stream={mockStream} />);

      const liveButton = screen.getByText(/Live Stream/i).closest('button');
      const playbackButton = screen
        .getByText(/Recorded Chunks/i)
        .closest('button');
      const horsesButton = screen
        .getByText(/Detected Horses/i)
        .closest('button');

      // Start on Live
      expect(liveButton).toHaveClass('bg-red-500/20');

      // Switch to Horses
      fireEvent.click(horsesButton!);
      await waitFor(() => {
        expect(horsesButton).toHaveClass('bg-cyan-500/20');
      });

      // Switch to Playback
      fireEvent.click(playbackButton!);
      await waitFor(() => {
        expect(playbackButton).toHaveClass('bg-blue-500/20');
      });

      // Switch back to Live
      fireEvent.click(liveButton!);
      await waitFor(() => {
        expect(liveButton).toHaveClass('bg-red-500/20');
      });
    });
  });

  describe('Close Button', () => {
    it('calls onClose when close button is clicked', () => {
      const onCloseMock = vi.fn();
      render(<PrimaryVideoPlayer stream={mockStream} onClose={onCloseMock} />);

      const closeButton = screen.getByTitle('Back to Dashboard');
      fireEvent.click(closeButton);

      expect(onCloseMock).toHaveBeenCalledOnce();
    });

    it('does not render close button when onClose is not provided', () => {
      render(<PrimaryVideoPlayer stream={mockStream} />);

      expect(screen.queryByTitle('Back to Dashboard')).not.toBeInTheDocument();
    });
  });
});
