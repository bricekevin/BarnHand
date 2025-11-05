import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { CorrectionBatchPanel } from '../CorrectionBatchPanel';
import { useCorrectionStore } from '../../stores/correctionStore';

// Mock the store
vi.mock('../../stores/correctionStore');

describe('CorrectionBatchPanel', () => {
  const mockHorses = [
    {
      id: 'horse_1',
      name: 'Thunder',
      color: [46, 125, 50] as [number, number, number],
      first_detected_frame: 0,
      last_detected_frame: 100,
      total_detections: 42,
      avg_confidence: 0.92,
      is_official: true,
    },
    {
      id: 'horse_2',
      name: 'Lightning',
      color: [33, 150, 243] as [number, number, number],
      first_detected_frame: 10,
      last_detected_frame: 95,
      total_detections: 38,
      avg_confidence: 0.87,
      is_official: false,
    },
  ];

  const mockPendingCorrections = [
    {
      id: 'correction_1',
      detection_index: 0,
      frame_index: 42,
      correction_type: 'reassign' as const,
      original_horse_id: 'horse_1',
      corrected_horse_id: 'horse_2',
      created_at: '2025-01-01T00:00:00Z',
    },
    {
      id: 'correction_2',
      detection_index: 1,
      frame_index: 55,
      correction_type: 'new_guest' as const,
      original_horse_id: 'horse_1',
      corrected_horse_name: 'Storm',
      created_at: '2025-01-01T00:01:00Z',
    },
    {
      id: 'correction_3',
      detection_index: 2,
      frame_index: 78,
      correction_type: 'mark_incorrect' as const,
      original_horse_id: 'horse_2',
      created_at: '2025-01-01T00:02:00Z',
    },
  ];

  const mockRemoveCorrection = vi.fn();
  const mockClearCorrections = vi.fn();
  const mockGetCorrectionCount = vi.fn();
  const mockOnProcessCorrections = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock store with default values
    (useCorrectionStore as any).mockReturnValue({
      pendingCorrections: mockPendingCorrections,
      removeCorrection: mockRemoveCorrection,
      clearCorrections: mockClearCorrections,
      getCorrectionCount: mockGetCorrectionCount,
    });

    mockGetCorrectionCount.mockReturnValue(mockPendingCorrections.length);
  });

  it('does not render when no pending corrections', () => {
    (useCorrectionStore as any).mockReturnValue({
      pendingCorrections: [],
      removeCorrection: mockRemoveCorrection,
      clearCorrections: mockClearCorrections,
      getCorrectionCount: () => 0,
    });

    const { container } = render(
      <CorrectionBatchPanel
        horses={mockHorses}
        onProcessCorrections={mockOnProcessCorrections}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('renders with pending corrections', () => {
    render(
      <CorrectionBatchPanel
        horses={mockHorses}
        onProcessCorrections={mockOnProcessCorrections}
      />
    );

    expect(screen.getByText('Pending Corrections')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument(); // Count badge
  });

  it('displays all correction types correctly', () => {
    render(
      <CorrectionBatchPanel
        horses={mockHorses}
        onProcessCorrections={mockOnProcessCorrections}
      />
    );

    // Check reassign correction
    expect(screen.getByText('Frame 42')).toBeInTheDocument();
    expect(screen.getByText('Thunder → Lightning')).toBeInTheDocument();
    expect(screen.getByText('Reassign')).toBeInTheDocument();

    // Check new guest correction
    expect(screen.getByText('Frame 55')).toBeInTheDocument();
    expect(screen.getByText('Thunder → Storm')).toBeInTheDocument();
    expect(screen.getByText('New Guest')).toBeInTheDocument();

    // Check mark incorrect correction
    expect(screen.getByText('Frame 78')).toBeInTheDocument();
    expect(screen.getByText('Lightning → Deleted')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('removes individual correction when X is clicked', () => {
    render(
      <CorrectionBatchPanel
        horses={mockHorses}
        onProcessCorrections={mockOnProcessCorrections}
      />
    );

    const removeButtons = screen.getAllByTitle('Remove this correction');
    fireEvent.click(removeButtons[0]);

    expect(mockRemoveCorrection).toHaveBeenCalledWith('correction_1');
  });

  it('clears all corrections with confirmation', () => {
    // Mock window.confirm
    const confirmSpy = vi
      .spyOn(window, 'confirm')
      .mockImplementation(() => true);

    render(
      <CorrectionBatchPanel
        horses={mockHorses}
        onProcessCorrections={mockOnProcessCorrections}
      />
    );

    const clearButton = screen.getByText('Clear All');
    fireEvent.click(clearButton);

    expect(confirmSpy).toHaveBeenCalled();
    expect(mockClearCorrections).toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  it('does not clear if user cancels confirmation', () => {
    const confirmSpy = vi
      .spyOn(window, 'confirm')
      .mockImplementation(() => false);

    render(
      <CorrectionBatchPanel
        horses={mockHorses}
        onProcessCorrections={mockOnProcessCorrections}
      />
    );

    const clearButton = screen.getByText('Clear All');
    fireEvent.click(clearButton);

    expect(confirmSpy).toHaveBeenCalled();
    expect(mockClearCorrections).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  it('shows confirmation dialog when Process Corrections is clicked', () => {
    render(
      <CorrectionBatchPanel
        horses={mockHorses}
        onProcessCorrections={mockOnProcessCorrections}
      />
    );

    const processButton = screen.getByText('Process Corrections');
    fireEvent.click(processButton);

    expect(screen.getByText('Confirm Processing')).toBeInTheDocument();
    expect(
      screen.getByText(/This will apply 3 corrections/)
    ).toBeInTheDocument();
  });

  it('processes corrections after confirmation', async () => {
    render(
      <CorrectionBatchPanel
        horses={mockHorses}
        onProcessCorrections={mockOnProcessCorrections}
      />
    );

    const processButton = screen.getByText('Process Corrections');
    fireEvent.click(processButton);

    const confirmButton = screen.getByText('Confirm');
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(mockOnProcessCorrections).toHaveBeenCalled();
    });
  });

  it('cancels confirmation and returns to corrections list', () => {
    render(
      <CorrectionBatchPanel
        horses={mockHorses}
        onProcessCorrections={mockOnProcessCorrections}
      />
    );

    const processButton = screen.getByText('Process Corrections');
    fireEvent.click(processButton);

    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    // Should return to corrections list
    expect(screen.getByText('Process Corrections')).toBeInTheDocument();
    expect(screen.queryByText('Confirm Processing')).not.toBeInTheDocument();
  });

  it('disables buttons when processing', () => {
    render(
      <CorrectionBatchPanel
        horses={mockHorses}
        onProcessCorrections={mockOnProcessCorrections}
        isProcessing={true}
      />
    );

    const processButton = screen.getByText('Processing...');
    expect(processButton).toBeDisabled();

    const clearButton = screen.getByText('Clear All');
    expect(clearButton).toBeDisabled();

    const removeButtons = screen.getAllByTitle('Remove this correction');
    removeButtons.forEach(button => {
      expect(button).toBeDisabled();
    });
  });

  it('shows processing spinner when isProcessing is true', () => {
    render(
      <CorrectionBatchPanel
        horses={mockHorses}
        onProcessCorrections={mockOnProcessCorrections}
        isProcessing={true}
      />
    );

    expect(screen.getByText('Processing...')).toBeInTheDocument();
  });

  it('uses fallback name when horse not found', () => {
    const correctionsWithUnknownHorse = [
      {
        id: 'correction_1',
        detection_index: 0,
        frame_index: 42,
        correction_type: 'reassign' as const,
        original_horse_id: 'horse_unknown',
        corrected_horse_id: 'horse_2',
        created_at: '2025-01-01T00:00:00Z',
      },
    ];

    (useCorrectionStore as any).mockReturnValue({
      pendingCorrections: correctionsWithUnknownHorse,
      removeCorrection: mockRemoveCorrection,
      clearCorrections: mockClearCorrections,
      getCorrectionCount: () => 1,
    });

    render(
      <CorrectionBatchPanel
        horses={mockHorses}
        onProcessCorrections={mockOnProcessCorrections}
      />
    );

    expect(screen.getByText(/Horse horse_unknown/)).toBeInTheDocument();
  });

  it('handles scrolling for many corrections', () => {
    const manyCorrections = Array.from({ length: 20 }, (_, i) => ({
      id: `correction_${i}`,
      detection_index: i,
      frame_index: i * 5,
      correction_type: 'reassign' as const,
      original_horse_id: 'horse_1',
      corrected_horse_id: 'horse_2',
      created_at: new Date().toISOString(),
    }));

    (useCorrectionStore as any).mockReturnValue({
      pendingCorrections: manyCorrections,
      removeCorrection: mockRemoveCorrection,
      clearCorrections: mockClearCorrections,
      getCorrectionCount: () => 20,
    });

    const { container } = render(
      <CorrectionBatchPanel
        horses={mockHorses}
        onProcessCorrections={mockOnProcessCorrections}
      />
    );

    const scrollableDiv = container.querySelector('.overflow-y-auto');
    expect(scrollableDiv).toBeInTheDocument();
    expect(scrollableDiv).toHaveClass('max-h-64');
  });
});
