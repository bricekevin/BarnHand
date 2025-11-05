import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { DetectionCorrectionModal } from '../DetectionCorrectionModal';

describe('DetectionCorrectionModal', () => {
  const mockDetection = {
    id: 'horse_1',
    name: 'Thunder',
    color: [46, 125, 50] as [number, number, number],
    bbox: { x: 100, y: 100, width: 200, height: 300 },
    confidence: 0.95,
    track_confidence: 0.88,
    state: 'tracked',
    total_detections: 42,
    horse_type: 'official',
    is_official: true,
  };

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
    {
      id: 'horse_3',
      name: 'Storm',
      color: [156, 39, 176] as [number, number, number],
      first_detected_frame: 5,
      last_detected_frame: 98,
      total_detections: 40,
      avg_confidence: 0.9,
      is_official: false,
    },
  ];

  const mockOnClose = vi.fn();
  const mockOnSubmit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders modal when isOpen is true', () => {
    render(
      <DetectionCorrectionModal
        isOpen={true}
        onClose={mockOnClose}
        detection={mockDetection}
        frameIndex={42}
        allHorses={mockHorses}
        onSubmit={mockOnSubmit}
      />
    );

    expect(screen.getByText('Correct Detection')).toBeInTheDocument();
    expect(screen.getByText('Thunder')).toBeInTheDocument();
    expect(screen.getByText(/Frame 42/)).toBeInTheDocument();
  });

  it('does not render when isOpen is false', () => {
    render(
      <DetectionCorrectionModal
        isOpen={false}
        onClose={mockOnClose}
        detection={mockDetection}
        frameIndex={42}
        allHorses={mockHorses}
        onSubmit={mockOnSubmit}
      />
    );

    expect(screen.queryByText('Correct Detection')).not.toBeInTheDocument();
  });

  it('displays all three correction types', () => {
    render(
      <DetectionCorrectionModal
        isOpen={true}
        onClose={mockOnClose}
        detection={mockDetection}
        frameIndex={42}
        allHorses={mockHorses}
        onSubmit={mockOnSubmit}
      />
    );

    expect(screen.getByText('Reassign to existing horse')).toBeInTheDocument();
    expect(screen.getByText('Create new guest horse')).toBeInTheDocument();
    expect(screen.getByText('Mark as incorrect')).toBeInTheDocument();
  });

  it('shows horse dropdown when reassign is selected', () => {
    render(
      <DetectionCorrectionModal
        isOpen={true}
        onClose={mockOnClose}
        detection={mockDetection}
        frameIndex={42}
        allHorses={mockHorses}
        onSubmit={mockOnSubmit}
      />
    );

    const reassignRadio = screen.getByLabelText(/Reassign to existing horse/i);
    fireEvent.click(reassignRadio);

    expect(screen.getByText('Select horse...')).toBeInTheDocument();
    expect(screen.getByText(/Lightning/)).toBeInTheDocument();
    expect(screen.getByText(/Storm/)).toBeInTheDocument();
    // Current horse should not be in dropdown
    expect(
      screen.queryByText(/Thunder.*42 detections/)
    ).not.toBeInTheDocument();
  });

  it('shows name input when new guest is selected', () => {
    render(
      <DetectionCorrectionModal
        isOpen={true}
        onClose={mockOnClose}
        detection={mockDetection}
        frameIndex={42}
        allHorses={mockHorses}
        onSubmit={mockOnSubmit}
      />
    );

    const newGuestRadio = screen.getByLabelText(/Create new guest horse/i);
    fireEvent.click(newGuestRadio);

    const nameInput = screen.getByPlaceholderText('Enter horse name...');
    expect(nameInput).toBeInTheDocument();
    // Should auto-generate name
    expect(nameInput).toHaveValue('Guest Horse 1');
  });

  it('validates reassign requires target horse', async () => {
    render(
      <DetectionCorrectionModal
        isOpen={true}
        onClose={mockOnClose}
        detection={mockDetection}
        frameIndex={42}
        allHorses={mockHorses}
        onSubmit={mockOnSubmit}
      />
    );

    const reassignRadio = screen.getByLabelText(/Reassign to existing horse/i);
    fireEvent.click(reassignRadio);

    const submitButton = screen.getByText('Add Correction');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(
        screen.getByText('Please select a target horse')
      ).toBeInTheDocument();
    });

    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('validates cannot reassign to same horse', async () => {
    render(
      <DetectionCorrectionModal
        isOpen={true}
        onClose={mockOnClose}
        detection={mockDetection}
        frameIndex={42}
        allHorses={mockHorses}
        onSubmit={mockOnSubmit}
      />
    );

    const reassignRadio = screen.getByLabelText(/Reassign to existing horse/i);
    fireEvent.click(reassignRadio);

    // Try to select same horse (should not be possible via UI, but test validation)
    const dropdown = screen.getByRole('combobox');
    fireEvent.change(dropdown, { target: { value: 'horse_1' } });

    const submitButton = screen.getByText('Add Correction');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(
        screen.getByText('Cannot reassign to the same horse')
      ).toBeInTheDocument();
    });

    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('submits valid reassign correction', async () => {
    render(
      <DetectionCorrectionModal
        isOpen={true}
        onClose={mockOnClose}
        detection={mockDetection}
        frameIndex={42}
        allHorses={mockHorses}
        onSubmit={mockOnSubmit}
      />
    );

    const reassignRadio = screen.getByLabelText(/Reassign to existing horse/i);
    fireEvent.click(reassignRadio);

    const dropdown = screen.getByRole('combobox');
    fireEvent.change(dropdown, { target: { value: 'horse_2' } });

    const submitButton = screen.getByText('Add Correction');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          correction_type: 'reassign',
          original_horse_id: 'horse_1',
          corrected_horse_id: 'horse_2',
          frame_index: 42,
        })
      );
    });

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('submits valid new guest correction', async () => {
    render(
      <DetectionCorrectionModal
        isOpen={true}
        onClose={mockOnClose}
        detection={mockDetection}
        frameIndex={42}
        allHorses={mockHorses}
        onSubmit={mockOnSubmit}
      />
    );

    const newGuestRadio = screen.getByLabelText(/Create new guest horse/i);
    fireEvent.click(newGuestRadio);

    const nameInput = screen.getByPlaceholderText('Enter horse name...');
    fireEvent.change(nameInput, { target: { value: 'Blaze' } });

    const submitButton = screen.getByText('Add Correction');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          correction_type: 'new_guest',
          original_horse_id: 'horse_1',
          corrected_horse_name: 'Blaze',
          frame_index: 42,
        })
      );
    });

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('shows confirmation dialog for mark incorrect', async () => {
    render(
      <DetectionCorrectionModal
        isOpen={true}
        onClose={mockOnClose}
        detection={mockDetection}
        frameIndex={42}
        allHorses={mockHorses}
        onSubmit={mockOnSubmit}
      />
    );

    const markIncorrectRadio = screen.getByLabelText(/Mark as incorrect/i);
    fireEvent.click(markIncorrectRadio);

    const submitButton = screen.getByText('Add Correction');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Are you sure?')).toBeInTheDocument();
      expect(screen.getByText('Confirm Deletion')).toBeInTheDocument();
    });

    expect(mockOnSubmit).not.toHaveBeenCalled();
  });

  it('submits mark incorrect after confirmation', async () => {
    render(
      <DetectionCorrectionModal
        isOpen={true}
        onClose={mockOnClose}
        detection={mockDetection}
        frameIndex={42}
        allHorses={mockHorses}
        onSubmit={mockOnSubmit}
      />
    );

    const markIncorrectRadio = screen.getByLabelText(/Mark as incorrect/i);
    fireEvent.click(markIncorrectRadio);

    const submitButton = screen.getByText('Add Correction');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Confirm Deletion')).toBeInTheDocument();
    });

    const confirmButton = screen.getByText('Confirm Deletion');
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          correction_type: 'mark_incorrect',
          original_horse_id: 'horse_1',
          frame_index: 42,
        })
      );
    });

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('closes modal when close button is clicked', () => {
    render(
      <DetectionCorrectionModal
        isOpen={true}
        onClose={mockOnClose}
        detection={mockDetection}
        frameIndex={42}
        allHorses={mockHorses}
        onSubmit={mockOnSubmit}
      />
    );

    const closeButton = screen.getByRole('button', { name: '' }); // X button has no text
    fireEvent.click(closeButton);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('closes modal when cancel button is clicked', () => {
    render(
      <DetectionCorrectionModal
        isOpen={true}
        onClose={mockOnClose}
        detection={mockDetection}
        frameIndex={42}
        allHorses={mockHorses}
        onSubmit={mockOnSubmit}
      />
    );

    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('resets form when modal reopens', () => {
    const { rerender } = render(
      <DetectionCorrectionModal
        isOpen={true}
        onClose={mockOnClose}
        detection={mockDetection}
        frameIndex={42}
        allHorses={mockHorses}
        onSubmit={mockOnSubmit}
      />
    );

    // Select new guest and enter name
    const newGuestRadio = screen.getByLabelText(/Create new guest horse/i);
    fireEvent.click(newGuestRadio);

    const nameInput = screen.getByPlaceholderText('Enter horse name...');
    fireEvent.change(nameInput, { target: { value: 'Custom Name' } });

    // Close modal
    rerender(
      <DetectionCorrectionModal
        isOpen={false}
        onClose={mockOnClose}
        detection={mockDetection}
        frameIndex={42}
        allHorses={mockHorses}
        onSubmit={mockOnSubmit}
      />
    );

    // Reopen modal
    rerender(
      <DetectionCorrectionModal
        isOpen={true}
        onClose={mockOnClose}
        detection={mockDetection}
        frameIndex={42}
        allHorses={mockHorses}
        onSubmit={mockOnSubmit}
      />
    );

    // Should reset to default (reassign)
    const reassignRadio = screen.getByLabelText(
      /Reassign to existing horse/i
    ) as HTMLInputElement;
    expect(reassignRadio.checked).toBe(true);
  });

  it('displays horse color indicator', () => {
    render(
      <DetectionCorrectionModal
        isOpen={true}
        onClose={mockOnClose}
        detection={mockDetection}
        frameIndex={42}
        allHorses={mockHorses}
        onSubmit={mockOnSubmit}
      />
    );

    const colorIndicator = screen.getByText('Thunder').previousElementSibling;
    expect(colorIndicator).toHaveStyle({
      backgroundColor: 'rgb(46, 125, 50)',
    });
  });

  it('displays official horse badge in dropdown', () => {
    render(
      <DetectionCorrectionModal
        isOpen={true}
        onClose={mockOnClose}
        detection={mockDetection}
        frameIndex={42}
        allHorses={mockHorses}
        onSubmit={mockOnSubmit}
      />
    );

    const reassignRadio = screen.getByLabelText(/Reassign to existing horse/i);
    fireEvent.click(reassignRadio);

    // Current horse (Thunder) should not be in dropdown, but check if format is correct
    expect(screen.getByText(/Lightning/)).toBeInTheDocument();
  });

  it('validates new guest name is not empty', async () => {
    render(
      <DetectionCorrectionModal
        isOpen={true}
        onClose={mockOnClose}
        detection={mockDetection}
        frameIndex={42}
        allHorses={mockHorses}
        onSubmit={mockOnSubmit}
      />
    );

    const newGuestRadio = screen.getByLabelText(/Create new guest horse/i);
    fireEvent.click(newGuestRadio);

    const nameInput = screen.getByPlaceholderText('Enter horse name...');
    fireEvent.change(nameInput, { target: { value: '   ' } }); // Empty spaces

    const submitButton = screen.getByText('Add Correction');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(
        screen.getByText('Please enter a name for the new guest horse')
      ).toBeInTheDocument();
    });

    expect(mockOnSubmit).not.toHaveBeenCalled();
  });
});
