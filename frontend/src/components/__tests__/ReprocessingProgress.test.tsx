import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { ReprocessingProgress } from '../ReprocessingProgress';
import { useReprocessingStore } from '../../stores/reprocessingStore';

// Mock the store
vi.mock('../../stores/reprocessingStore');

describe('ReprocessingProgress', () => {
  const mockReset = vi.fn();
  const mockOnComplete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render when status is idle', () => {
    (useReprocessingStore as any).mockReturnValue({
      status: 'idle',
      progress: 0,
      currentStep: '',
      error: null,
      reset: mockReset,
    });

    const { container } = render(<ReprocessingProgress />);
    expect(container.firstChild).toBeNull();
  });

  it('renders with pending status', () => {
    (useReprocessingStore as any).mockReturnValue({
      status: 'pending',
      progress: 0,
      currentStep: 'Starting...',
      error: null,
      reset: mockReset,
    });

    render(<ReprocessingProgress />);

    expect(screen.getByText('Re-Processing Chunk')).toBeInTheDocument();
    expect(screen.getByText('Queued')).toBeInTheDocument();
    expect(screen.getByText('Starting...')).toBeInTheDocument();
  });

  it('renders with running status and progress', () => {
    (useReprocessingStore as any).mockReturnValue({
      status: 'running',
      progress: 45,
      currentStep: 'Updating ReID features...',
      error: null,
      reset: mockReset,
    });

    render(<ReprocessingProgress />);

    expect(screen.getByText('Processing')).toBeInTheDocument();
    expect(screen.getByText('45%')).toBeInTheDocument();
    expect(screen.getByText('Updating ReID features...')).toBeInTheDocument();
  });

  it('shows spinner when running', () => {
    (useReprocessingStore as any).mockReturnValue({
      status: 'running',
      progress: 50,
      currentStep: 'Regenerating frames...',
      error: null,
      reset: mockReset,
    });

    const { container } = render(<ReprocessingProgress />);

    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('renders with completed status', () => {
    (useReprocessingStore as any).mockReturnValue({
      status: 'completed',
      progress: 100,
      currentStep: 'Complete!',
      error: null,
      reset: mockReset,
    });

    render(<ReprocessingProgress />);

    expect(screen.getByText('Complete')).toBeInTheDocument();
    expect(screen.getByText('Complete!')).toBeInTheDocument();
  });

  it('shows checkmark icon when completed', () => {
    (useReprocessingStore as any).mockReturnValue({
      status: 'completed',
      progress: 100,
      currentStep: 'Complete!',
      error: null,
      reset: mockReset,
    });

    const { container } = render(<ReprocessingProgress />);

    const checkmark = container.querySelector('svg.text-emerald-400');
    expect(checkmark).toBeInTheDocument();
  });

  it('calls onComplete callback when status becomes completed', async () => {
    (useReprocessingStore as any).mockReturnValue({
      status: 'completed',
      progress: 100,
      currentStep: 'Complete!',
      error: null,
      reset: mockReset,
    });

    render(<ReprocessingProgress onComplete={mockOnComplete} />);

    await waitFor(() => {
      expect(mockOnComplete).toHaveBeenCalled();
    });
  });

  it('auto-hides after completion', async () => {
    vi.useFakeTimers();

    (useReprocessingStore as any).mockReturnValue({
      status: 'completed',
      progress: 100,
      currentStep: 'Complete!',
      error: null,
      reset: mockReset,
    });

    render(<ReprocessingProgress />);

    // Fast-forward 3 seconds
    vi.advanceTimersByTime(3000);

    await waitFor(() => {
      expect(mockReset).toHaveBeenCalled();
    });

    vi.useRealTimers();
  });

  it('renders with failed status and error message', () => {
    (useReprocessingStore as any).mockReturnValue({
      status: 'failed',
      progress: 30,
      currentStep: 'Failed',
      error: 'Frame regeneration failed: out of memory',
      reset: mockReset,
    });

    render(<ReprocessingProgress />);

    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(
      screen.getByText('Frame regeneration failed: out of memory')
    ).toBeInTheDocument();
  });

  it('shows error icon when failed', () => {
    (useReprocessingStore as any).mockReturnValue({
      status: 'failed',
      progress: 30,
      currentStep: 'Failed',
      error: 'Connection timeout',
      reset: mockReset,
    });

    const { container } = render(<ReprocessingProgress />);

    const errorIcon = container.querySelector('svg.text-red-400');
    expect(errorIcon).toBeInTheDocument();
  });

  it('hides progress bar when failed', () => {
    (useReprocessingStore as any).mockReturnValue({
      status: 'failed',
      progress: 30,
      currentStep: 'Failed',
      error: 'Error',
      reset: mockReset,
    });

    const { container } = render(<ReprocessingProgress />);

    const progressBar = container.querySelector('.bg-slate-700');
    expect(progressBar).not.toBeInTheDocument();
  });

  it('shows processing steps when running', () => {
    (useReprocessingStore as any).mockReturnValue({
      status: 'running',
      progress: 50,
      currentStep: 'Regenerating frames...',
      error: null,
      reset: mockReset,
    });

    render(<ReprocessingProgress />);

    expect(screen.getByText('Apply')).toBeInTheDocument();
    expect(screen.getByText('ReID')).toBeInTheDocument();
    expect(screen.getByText('Frames')).toBeInTheDocument();
    expect(screen.getByText('Video')).toBeInTheDocument();
    expect(screen.getByText('Save')).toBeInTheDocument();
  });

  it('highlights completed processing steps', () => {
    (useReprocessingStore as any).mockReturnValue({
      status: 'running',
      progress: 55,
      currentStep: 'Regenerating frames...',
      error: null,
      reset: mockReset,
    });

    const { container } = render(<ReprocessingProgress />);

    // Steps with progress >= 20, 40 should be highlighted (Apply, ReID)
    const applyStep = screen.getByText('Apply').parentElement;
    expect(applyStep).toHaveClass('text-cyan-400');

    const reidStep = screen.getByText('ReID').parentElement;
    expect(reidStep).toHaveClass('text-cyan-400');

    // Frames step should be highlighted since progress is 55
    const framesStep = screen.getByText('Frames').parentElement;
    expect(framesStep).toHaveClass('text-cyan-400');

    // Video and Save should not be highlighted yet
    const videoStep = screen.getByText('Video').parentElement;
    expect(videoStep).toHaveClass('text-slate-500');
  });

  it('updates progress bar width based on progress value', () => {
    (useReprocessingStore as any).mockReturnValue({
      status: 'running',
      progress: 75,
      currentStep: 'Rebuilding video...',
      error: null,
      reset: mockReset,
    });

    const { container } = render(<ReprocessingProgress />);

    const progressBarFill = container.querySelector('.bg-cyan-500');
    expect(progressBarFill).toHaveStyle({ width: '75%' });
  });

  it('shows percentage with running status', () => {
    (useReprocessingStore as any).mockReturnValue({
      status: 'running',
      progress: 33.7,
      currentStep: 'Applying corrections...',
      error: null,
      reset: mockReset,
    });

    render(<ReprocessingProgress />);

    expect(screen.getByText('34%')).toBeInTheDocument(); // Rounded
  });

  it('does not show percentage when not running', () => {
    (useReprocessingStore as any).mockReturnValue({
      status: 'pending',
      progress: 0,
      currentStep: 'Starting...',
      error: null,
      reset: mockReset,
    });

    render(<ReprocessingProgress />);

    expect(screen.queryByText(/\d+%/)).not.toBeInTheDocument();
  });

  it('applies correct status colors', () => {
    const statuses = [
      { status: 'pending', color: 'bg-amber-500' },
      { status: 'running', color: 'bg-cyan-500' },
      { status: 'completed', color: 'bg-emerald-500' },
      { status: 'failed', color: 'bg-red-500' },
    ];

    statuses.forEach(({ status, color }) => {
      (useReprocessingStore as any).mockReturnValue({
        status,
        progress: 50,
        currentStep: 'Test',
        error: null,
        reset: mockReset,
      });

      const { container, unmount } = render(<ReprocessingProgress />);

      if (status !== 'failed') {
        const progressBar = container.querySelector(`.${color}`);
        expect(progressBar).toBeInTheDocument();
      }

      unmount();
    });
  });

  it('cleans up timeout on unmount', () => {
    vi.useFakeTimers();

    (useReprocessingStore as any).mockReturnValue({
      status: 'completed',
      progress: 100,
      currentStep: 'Complete!',
      error: null,
      reset: mockReset,
    });

    const { unmount } = render(<ReprocessingProgress />);

    unmount();

    // Advance timers past the 3-second delay
    vi.advanceTimersByTime(3000);

    // Reset should not be called since component was unmounted
    expect(mockReset).not.toHaveBeenCalled();

    vi.useRealTimers();
  });
});
