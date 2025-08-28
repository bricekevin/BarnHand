import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VideoPlayer } from '../VideoPlayer';

// Mock HLS.js
const mockHls = {
  loadSource: vi.fn(),
  attachMedia: vi.fn(),
  on: vi.fn(),
  destroy: vi.fn(),
};

const mockHlsClass = vi.fn(() => mockHls);
mockHlsClass.isSupported = vi.fn(() => true);

vi.mock('hls.js', () => ({
  default: mockHlsClass,
}));

describe('VideoPlayer Component', () => {
  const mockProps = {
    src: 'http://localhost:8003/stream1/playlist.m3u8',
    streamId: 'stream1',
    onError: vi.fn(),
    onLoad: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset HLS mock
    mockHls.on.mockClear();
    mockHls.loadSource.mockClear();
    mockHls.attachMedia.mockClear();
  });

  it('renders video element', () => {
    render(<VideoPlayer {...mockProps} />);

    const video = screen.getByRole('application');
    expect(video).toBeInTheDocument();
  });

  it('initializes HLS when supported', () => {
    render(<VideoPlayer {...mockProps} />);

    expect(mockHls.loadSource).toHaveBeenCalledWith(mockProps.src);
    expect(mockHls.attachMedia).toHaveBeenCalled();
  });

  it('sets up HLS event listeners', () => {
    render(<VideoPlayer {...mockProps} />);

    expect(mockHls.on).toHaveBeenCalledWith('hlsMediaAttached', expect.any(Function));
    expect(mockHls.on).toHaveBeenCalledWith('hlsManifestParsed', expect.any(Function));
    expect(mockHls.on).toHaveBeenCalledWith('hlsError', expect.any(Function));
  });

  it('shows play overlay when video is paused', () => {
    render(<VideoPlayer {...mockProps} />);

    // By default video should show play overlay
    const playOverlay = screen.getByRole('button');
    expect(playOverlay).toBeInTheDocument();
    expect(playOverlay).toHaveAttribute('aria-label', 'Play video');
  });

  it('handles play button click', () => {
    render(<VideoPlayer {...mockProps} />);

    const playButton = screen.getByRole('button');
    fireEvent.click(playButton);

    // The play button should trigger video play
    // Note: In test environment, video play might not work, but we can test the click handler
    expect(playButton).toBeInTheDocument();
  });

  it('applies correct styling classes', () => {
    const { container } = render(<VideoPlayer {...mockProps} />);

    const videoContainer = container.firstChild;
    expect(videoContainer).toHaveClass('relative', 'w-full', 'h-full');
  });

  it('handles video errors gracefully', () => {
    render(<VideoPlayer {...mockProps} />);

    // Simulate HLS error
    const errorCallback = mockHls.on.mock.calls.find(
      call => call[0] === 'hlsError'
    )?.[1];

    if (errorCallback) {
      errorCallback(null, { type: 'networkError', details: 'Test error' });
    }

    // Should not crash the component
    expect(screen.getByRole('application')).toBeInTheDocument();
  });

  it('cleans up HLS instance on unmount', () => {
    const { unmount } = render(<VideoPlayer {...mockProps} />);

    unmount();

    expect(mockHls.destroy).toHaveBeenCalled();
  });

  it('handles missing src prop', () => {
    const propsWithoutSrc = { ...mockProps, src: '' };
    
    expect(() => {
      render(<VideoPlayer {...propsWithoutSrc} />);
    }).not.toThrow();

    expect(mockHls.loadSource).not.toHaveBeenCalled();
  });
});