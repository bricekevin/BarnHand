import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { Horse } from '../../../../shared/src/types/horse.types';
import { HorseEditModal } from '../HorseEditModal';

// Mock horse data
const mockHorse: Horse = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  farm_id: '123e4567-e89b-12d3-a456-426614174001',
  stream_id: '123e4567-e89b-12d3-a456-426614174002',
  name: 'Thunder',
  breed: 'Thoroughbred',
  age: 5,
  color: 'Bay',
  markings: 'White star on forehead',
  tracking_id: 'horse_003',
  assigned_color: '#06B6D4',
  status: 'identified',
  confidence_score: 0.95,
  first_detected: '2025-01-14T10:00:00Z',
  last_seen: '2025-01-14T12:30:00Z',
  total_detections: 42,
  avatar_thumbnail: 'base64encodedimage',
  metadata: {
    notes: 'Very active horse',
  },
  created_at: '2025-01-14T10:00:00Z',
  updated_at: '2025-01-14T12:30:00Z',
};

const mockHorseNoName: Horse = {
  ...mockHorse,
  name: undefined,
  metadata: undefined,
};

describe('HorseEditModal', () => {
  let onClose: ReturnType<typeof vi.fn>;
  let onSave: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onClose = vi.fn();
    onSave = vi.fn();
  });

  describe('Rendering', () => {
    it('should render modal with horse data', () => {
      render(
        <HorseEditModal horse={mockHorse} onClose={onClose} onSave={onSave} />
      );

      expect(screen.getByText('Edit Horse Details')).toBeInTheDocument();
      expect(
        screen.getByText('Update information for Horse #3')
      ).toBeInTheDocument();
      expect(screen.getByLabelText('Horse Name')).toHaveValue('Thunder');
      expect(screen.getByLabelText('Notes (Optional)')).toHaveValue(
        'Very active horse'
      );
    });

    it('should render modal with unnamed horse', () => {
      render(
        <HorseEditModal
          horse={mockHorseNoName}
          onClose={onClose}
          onSave={onSave}
        />
      );

      expect(screen.getByLabelText('Horse Name')).toHaveValue('');
      expect(screen.getByLabelText('Notes (Optional)')).toHaveValue('');
    });

    it('should display avatar image when available', () => {
      render(
        <HorseEditModal horse={mockHorse} onClose={onClose} onSave={onSave} />
      );

      const avatar = screen.getByAltText('Thunder thumbnail');
      expect(avatar).toBeInTheDocument();
      expect(avatar).toHaveAttribute(
        'src',
        'data:image/jpeg;base64,base64encodedimage'
      );
    });

    it('should display fallback icon when no avatar', () => {
      const horseNoAvatar = { ...mockHorse, avatar_thumbnail: undefined };
      render(
        <HorseEditModal
          horse={horseNoAvatar}
          onClose={onClose}
          onSave={onSave}
        />
      );

      // Check for SVG horse icon
      const svgIcon = screen
        .getByRole('dialog')
        .querySelector('svg path[d*="M20 8h-2.81"]');
      expect(svgIcon).toBeInTheDocument();
    });

    it('should display tracking ID badge', () => {
      render(
        <HorseEditModal horse={mockHorse} onClose={onClose} onSave={onSave} />
      );

      expect(screen.getByText('#3')).toBeInTheDocument();
    });

    it('should display character count for name field', () => {
      render(
        <HorseEditModal horse={mockHorse} onClose={onClose} onSave={onSave} />
      );

      expect(screen.getByText('7/100')).toBeInTheDocument(); // "Thunder" = 7 chars
    });

    it('should display character count for notes field', () => {
      render(
        <HorseEditModal horse={mockHorse} onClose={onClose} onSave={onSave} />
      );

      expect(screen.getByText('17/500')).toBeInTheDocument(); // "Very active horse" = 17 chars
    });

    it('should render Save and Cancel buttons', () => {
      render(
        <HorseEditModal horse={mockHorse} onClose={onClose} onSave={onSave} />
      );

      expect(screen.getByText('Cancel')).toBeInTheDocument();
      expect(screen.getByText('Save Changes')).toBeInTheDocument();
    });
  });

  describe('Form Validation', () => {
    it('should show error when name is empty', async () => {
      const user = userEvent.setup();
      render(
        <HorseEditModal horse={mockHorse} onClose={onClose} onSave={onSave} />
      );

      const nameInput = screen.getByLabelText('Horse Name');
      await user.clear(nameInput);

      const saveButton = screen.getByText('Save Changes');
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText('Name is required')).toBeInTheDocument();
      });

      expect(onSave).not.toHaveBeenCalled();
    });

    it('should show error when name exceeds 100 characters', async () => {
      const user = userEvent.setup();
      render(
        <HorseEditModal horse={mockHorse} onClose={onClose} onSave={onSave} />
      );

      const nameInput = screen.getByLabelText('Horse Name');
      await user.clear(nameInput);
      await user.type(nameInput, 'a'.repeat(101));

      const saveButton = screen.getByText('Save Changes');
      await user.click(saveButton);

      await waitFor(() => {
        expect(
          screen.getByText('Name must be 100 characters or less')
        ).toBeInTheDocument();
      });

      expect(onSave).not.toHaveBeenCalled();
    });

    it('should show error when notes exceed 500 characters', async () => {
      const user = userEvent.setup();
      render(
        <HorseEditModal horse={mockHorse} onClose={onClose} onSave={onSave} />
      );

      const notesInput = screen.getByLabelText('Notes (Optional)');
      await user.clear(notesInput);
      await user.type(notesInput, 'a'.repeat(501));

      const saveButton = screen.getByText('Save Changes');
      await user.click(saveButton);

      await waitFor(() => {
        expect(
          screen.getByText('Notes must be 500 characters or less')
        ).toBeInTheDocument();
      });

      expect(onSave).not.toHaveBeenCalled();
    });

    it('should accept valid name (100 characters)', async () => {
      const user = userEvent.setup();
      onSave.mockResolvedValue(undefined);

      render(
        <HorseEditModal horse={mockHorse} onClose={onClose} onSave={onSave} />
      );

      const nameInput = screen.getByLabelText('Horse Name');
      await user.clear(nameInput);
      await user.type(nameInput, 'a'.repeat(100));

      const saveButton = screen.getByText('Save Changes');
      await user.click(saveButton);

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith({ name: 'a'.repeat(100) });
      });
    });

    it('should accept valid notes (500 characters)', async () => {
      const user = userEvent.setup();
      onSave.mockResolvedValue(undefined);

      render(
        <HorseEditModal horse={mockHorse} onClose={onClose} onSave={onSave} />
      );

      const notesInput = screen.getByLabelText('Notes (Optional)');
      await user.clear(notesInput);
      await user.type(notesInput, 'b'.repeat(500));

      const saveButton = screen.getByText('Save Changes');
      await user.click(saveButton);

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith({ notes: 'b'.repeat(500) });
      });
    });

    it('should allow empty notes', async () => {
      const user = userEvent.setup();
      onSave.mockResolvedValue(undefined);

      render(
        <HorseEditModal horse={mockHorse} onClose={onClose} onSave={onSave} />
      );

      const notesInput = screen.getByLabelText('Notes (Optional)');
      await user.clear(notesInput);

      const saveButton = screen.getByText('Save Changes');
      await user.click(saveButton);

      await waitFor(() => {
        expect(onSave).toHaveBeenCalled();
      });
    });
  });

  describe('Form Submission', () => {
    it('should call onSave with updated name', async () => {
      const user = userEvent.setup();
      onSave.mockResolvedValue(undefined);

      render(
        <HorseEditModal horse={mockHorse} onClose={onClose} onSave={onSave} />
      );

      const nameInput = screen.getByLabelText('Horse Name');
      await user.clear(nameInput);
      await user.type(nameInput, 'Lightning');

      const saveButton = screen.getByText('Save Changes');
      await user.click(saveButton);

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith({ name: 'Lightning' });
      });
    });

    it('should call onSave with updated notes', async () => {
      const user = userEvent.setup();
      onSave.mockResolvedValue(undefined);

      render(
        <HorseEditModal horse={mockHorse} onClose={onClose} onSave={onSave} />
      );

      const notesInput = screen.getByLabelText('Notes (Optional)');
      await user.clear(notesInput);
      await user.type(notesInput, 'New notes about this horse');

      const saveButton = screen.getByText('Save Changes');
      await user.click(saveButton);

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith({
          notes: 'New notes about this horse',
        });
      });
    });

    it('should call onSave with both name and notes', async () => {
      const user = userEvent.setup();
      onSave.mockResolvedValue(undefined);

      render(
        <HorseEditModal horse={mockHorse} onClose={onClose} onSave={onSave} />
      );

      const nameInput = screen.getByLabelText('Horse Name');
      await user.clear(nameInput);
      await user.type(nameInput, 'Spirit');

      const notesInput = screen.getByLabelText('Notes (Optional)');
      await user.clear(notesInput);
      await user.type(notesInput, 'Gentle and friendly');

      const saveButton = screen.getByText('Save Changes');
      await user.click(saveButton);

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith({
          name: 'Spirit',
          notes: 'Gentle and friendly',
        });
      });
    });

    it('should trim whitespace from name and notes', async () => {
      const user = userEvent.setup();
      onSave.mockResolvedValue(undefined);

      render(
        <HorseEditModal horse={mockHorse} onClose={onClose} onSave={onSave} />
      );

      const nameInput = screen.getByLabelText('Horse Name');
      await user.clear(nameInput);
      await user.type(nameInput, '  Blaze  ');

      const notesInput = screen.getByLabelText('Notes (Optional)');
      await user.clear(notesInput);
      await user.type(notesInput, '  Note text  ');

      const saveButton = screen.getByText('Save Changes');
      await user.click(saveButton);

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith({
          name: 'Blaze',
          notes: 'Note text',
        });
      });
    });

    it('should not call onSave if no changes made', async () => {
      const user = userEvent.setup();
      onSave.mockResolvedValue(undefined);

      render(
        <HorseEditModal horse={mockHorse} onClose={onClose} onSave={onSave} />
      );

      const saveButton = screen.getByText('Save Changes');
      await user.click(saveButton);

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith({});
      });
    });

    it('should show loading spinner during save', async () => {
      const user = userEvent.setup();
      onSave.mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 100))
      );

      render(
        <HorseEditModal horse={mockHorse} onClose={onClose} onSave={onSave} />
      );

      const nameInput = screen.getByLabelText('Horse Name');
      await user.clear(nameInput);
      await user.type(nameInput, 'Flash');

      const saveButton = screen.getByText('Save Changes');
      await user.click(saveButton);

      expect(screen.getByText('Saving...')).toBeInTheDocument();

      await waitFor(() => {
        expect(onSave).toHaveBeenCalled();
      });
    });

    it('should disable form during submission', async () => {
      const user = userEvent.setup();
      onSave.mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 100))
      );

      render(
        <HorseEditModal horse={mockHorse} onClose={onClose} onSave={onSave} />
      );

      const nameInput = screen.getByLabelText('Horse Name');
      await user.clear(nameInput);
      await user.type(nameInput, 'Flash');

      const saveButton = screen.getByText('Save Changes');
      await user.click(saveButton);

      expect(screen.getByLabelText('Horse Name')).toBeDisabled();
      expect(screen.getByLabelText('Notes (Optional)')).toBeDisabled();
      expect(screen.getByText('Cancel')).toBeDisabled();

      await waitFor(() => {
        expect(onSave).toHaveBeenCalled();
      });
    });

    it('should show success toast on successful save', async () => {
      const user = userEvent.setup();
      onSave.mockResolvedValue(undefined);

      render(
        <HorseEditModal horse={mockHorse} onClose={onClose} onSave={onSave} />
      );

      const nameInput = screen.getByLabelText('Horse Name');
      await user.clear(nameInput);
      await user.type(nameInput, 'Dash');

      const saveButton = screen.getByText('Save Changes');
      await user.click(saveButton);

      await waitFor(() => {
        expect(
          screen.getByText('Horse details updated successfully!')
        ).toBeInTheDocument();
      });
    });

    it('should show error toast on save failure', async () => {
      const user = userEvent.setup();
      onSave.mockRejectedValue(new Error('Network error'));

      render(
        <HorseEditModal horse={mockHorse} onClose={onClose} onSave={onSave} />
      );

      const nameInput = screen.getByLabelText('Horse Name');
      await user.clear(nameInput);
      await user.type(nameInput, 'Storm');

      const saveButton = screen.getByText('Save Changes');
      await user.click(saveButton);

      await waitFor(() => {
        expect(screen.getByText('Network error')).toBeInTheDocument();
      });

      expect(onClose).not.toHaveBeenCalled();
    });

    it('should close modal after successful save', async () => {
      const user = userEvent.setup();
      onSave.mockResolvedValue(undefined);

      render(
        <HorseEditModal horse={mockHorse} onClose={onClose} onSave={onSave} />
      );

      const nameInput = screen.getByLabelText('Horse Name');
      await user.clear(nameInput);
      await user.type(nameInput, 'Rocky');

      const saveButton = screen.getByText('Save Changes');
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(onSave).toHaveBeenCalled();
      });

      // Wait for auto-close after 1 second
      await waitFor(
        () => {
          expect(onClose).toHaveBeenCalled();
        },
        { timeout: 2000 }
      );
    });
  });

  describe('Modal Interactions', () => {
    it('should close modal on Cancel button click', () => {
      render(
        <HorseEditModal horse={mockHorse} onClose={onClose} onSave={onSave} />
      );

      const cancelButton = screen.getByText('Cancel');
      fireEvent.click(cancelButton);

      expect(onClose).toHaveBeenCalled();
    });

    it('should close modal on X button click', () => {
      render(
        <HorseEditModal horse={mockHorse} onClose={onClose} onSave={onSave} />
      );

      const closeButton = screen.getByLabelText('Close modal');
      fireEvent.click(closeButton);

      expect(onClose).toHaveBeenCalled();
    });

    it('should close modal on backdrop click', () => {
      render(
        <HorseEditModal horse={mockHorse} onClose={onClose} onSave={onSave} />
      );

      const backdrop = screen.getByRole('dialog');
      fireEvent.click(backdrop);

      expect(onClose).toHaveBeenCalled();
    });

    it('should close modal on Escape key', () => {
      render(
        <HorseEditModal horse={mockHorse} onClose={onClose} onSave={onSave} />
      );

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(onClose).toHaveBeenCalled();
    });

    it('should not close on backdrop click during submission', async () => {
      const user = userEvent.setup();
      let resolveSubmit: () => void;
      const submitPromise = new Promise<void>(resolve => {
        resolveSubmit = resolve;
      });
      onSave.mockImplementation(() => submitPromise);

      render(
        <HorseEditModal horse={mockHorse} onClose={onClose} onSave={onSave} />
      );

      const nameInput = screen.getByLabelText('Horse Name');
      await user.clear(nameInput);
      await user.type(nameInput, 'Star');

      const saveButton = screen.getByText('Save Changes');
      const form = saveButton.closest('form');
      if (form) {
        fireEvent.submit(form);
      }

      await waitFor(() => {
        expect(screen.getByText('Saving...')).toBeInTheDocument();
      });

      const backdrop = screen.getByRole('dialog');
      fireEvent.click(backdrop);

      expect(onClose).not.toHaveBeenCalled();

      // Resolve the promise
      resolveSubmit!();

      // Wait for the save to complete
      await waitFor(
        () => {
          expect(onSave).toHaveBeenCalled();
        },
        { timeout: 2000 }
      );
    });

    it('should not close on Escape during submission', async () => {
      const user = userEvent.setup();
      let resolveSubmit: () => void;
      const submitPromise = new Promise<void>(resolve => {
        resolveSubmit = resolve;
      });
      onSave.mockImplementation(() => submitPromise);

      render(
        <HorseEditModal horse={mockHorse} onClose={onClose} onSave={onSave} />
      );

      const nameInput = screen.getByLabelText('Horse Name');
      await user.clear(nameInput);
      await user.type(nameInput, 'Star');

      const saveButton = screen.getByText('Save Changes');
      const form = saveButton.closest('form');
      if (form) {
        fireEvent.submit(form);
      }

      await waitFor(() => {
        expect(screen.getByText('Saving...')).toBeInTheDocument();
      });

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(onClose).not.toHaveBeenCalled();

      // Resolve the promise
      resolveSubmit!();

      // Wait for the save to complete
      await waitFor(
        () => {
          expect(onSave).toHaveBeenCalled();
        },
        { timeout: 2000 }
      );
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA attributes', () => {
      render(
        <HorseEditModal horse={mockHorse} onClose={onClose} onSave={onSave} />
      );

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAttribute('aria-labelledby', 'modal-title');
    });

    it('should have accessible form labels', () => {
      render(
        <HorseEditModal horse={mockHorse} onClose={onClose} onSave={onSave} />
      );

      expect(screen.getByLabelText('Horse Name')).toBeInTheDocument();
      expect(screen.getByLabelText('Notes (Optional)')).toBeInTheDocument();
      expect(screen.getByLabelText('Close modal')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle horse with tracking_id without numbers', () => {
      const horseNoNumber = { ...mockHorse, tracking_id: 'horse_abc' };
      render(
        <HorseEditModal
          horse={horseNoNumber}
          onClose={onClose}
          onSave={onSave}
        />
      );

      expect(screen.getByText('#horse_abc')).toBeInTheDocument();
    });

    it('should handle horse with complex metadata', () => {
      const horseComplexMeta = {
        ...mockHorse,
        metadata: {
          notes: 'Test notes',
          other_field: 'ignored',
          nested: { data: 'also ignored' },
        },
      };

      render(
        <HorseEditModal
          horse={horseComplexMeta}
          onClose={onClose}
          onSave={onSave}
        />
      );

      expect(screen.getByLabelText('Notes (Optional)')).toHaveValue(
        'Test notes'
      );
    });

    it('should handle horse with non-string metadata.notes', () => {
      const horseBadMeta = {
        ...mockHorse,
        metadata: { notes: 123 as any },
      };

      render(
        <HorseEditModal
          horse={horseBadMeta}
          onClose={onClose}
          onSave={onSave}
        />
      );

      // Should default to empty string when metadata.notes is not a string
      const notesInput = screen.getByLabelText('Notes (Optional)');
      expect(notesInput).toHaveValue('');
    });

    it('should hide toast after 3 seconds', async () => {
      const user = userEvent.setup();
      onSave.mockResolvedValue(undefined);

      render(
        <HorseEditModal horse={mockHorse} onClose={onClose} onSave={onSave} />
      );

      const nameInput = screen.getByLabelText('Horse Name');
      await user.clear(nameInput);
      await user.type(nameInput, 'Comet');

      const saveButton = screen.getByText('Save Changes');
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(
          screen.getByText('Horse details updated successfully!')
        ).toBeInTheDocument();
      });

      // Wait for toast to disappear after 3 seconds
      await waitFor(
        () => {
          expect(
            screen.queryByText('Horse details updated successfully!')
          ).not.toBeInTheDocument();
        },
        { timeout: 4000 }
      );
    });
  });
});
