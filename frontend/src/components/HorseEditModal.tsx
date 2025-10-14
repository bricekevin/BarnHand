import React, { useState, useEffect } from 'react';

import type { Horse } from '../../../shared/src/types/horse.types';

interface HorseEditModalProps {
  horse: Horse;
  onClose: () => void;
  onSave: (updates: { name?: string; notes?: string }) => void;
}

interface FormData {
  name: string;
  notes: string;
}

interface FormErrors {
  name?: string;
  notes?: string;
}

/**
 * HorseEditModal - Modal component for editing horse details
 *
 * Features:
 * - Edit horse name and notes
 * - Form validation (name max 100 chars, notes max 500 chars)
 * - API integration with PUT /api/v1/streams/:streamId/horses/:horseId
 * - Loading, success, and error states
 * - Toast notifications for feedback
 * - Glass morphism modal with backdrop blur
 */
export const HorseEditModal: React.FC<HorseEditModalProps> = ({
  horse,
  onClose,
  onSave,
}) => {
  const [formData, setFormData] = useState<FormData>({
    name: horse.name || '',
    notes:
      typeof horse.metadata?.notes === 'string' ? horse.metadata.notes : '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Show toast for 3 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose, isSubmitting]);

  // Validate form fields
  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    // Name validation
    if (formData.name.trim().length === 0) {
      newErrors.name = 'Name is required';
    } else if (formData.name.length > 100) {
      newErrors.name = 'Name must be 100 characters or less';
    }

    // Notes validation
    if (formData.notes.length > 500) {
      newErrors.notes = 'Notes must be 500 characters or less';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      // Call the onSave callback with the updates
      const updates: { name?: string; notes?: string } = {};

      if (formData.name.trim() !== (horse.name || '')) {
        updates.name = formData.name.trim();
      }

      if (formData.notes.trim() !== ((horse.metadata?.notes as string) || '')) {
        updates.notes = formData.notes.trim();
      }

      await onSave(updates);

      setToast({
        type: 'success',
        message: 'Horse details updated successfully!',
      });

      // Close modal after short delay to show success message
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (error) {
      console.error('Error saving horse:', error);
      setToast({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Failed to save horse details',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !isSubmitting) {
      onClose();
    }
  };

  // Extract tracking number from tracking_id
  const getTrackingNumber = (trackingId: string): string => {
    const match = trackingId.match(/\d+$/);
    return match ? parseInt(match[0], 10).toString() : trackingId;
  };

  const trackingNumber = getTrackingNumber(horse.tracking_id);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      {/* Modal Container */}
      <div className="bg-slate-900/95 border border-slate-700/50 rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-slate-900/95 backdrop-blur-sm border-b border-slate-700/50 p-6 z-10">
          <div className="flex items-start justify-between">
            <div>
              <h2
                id="modal-title"
                className="text-xl font-display font-semibold text-slate-100"
              >
                Edit Horse Details
              </h2>
              <p className="text-sm text-slate-400 mt-1">
                Update information for Horse #{trackingNumber}
              </p>
            </div>
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="text-slate-400 hover:text-slate-200 transition-colors p-1 rounded-lg hover:bg-slate-800/50 disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Close modal"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Avatar Display */}
        <div className="flex justify-center py-6 bg-gradient-to-b from-slate-900/95 to-transparent">
          <div className="relative">
            {horse.avatar_thumbnail ? (
              <img
                src={`data:image/jpeg;base64,${horse.avatar_thumbnail}`}
                alt={`${horse.name || 'Horse'} thumbnail`}
                className="w-32 h-32 rounded-2xl object-cover border-4 shadow-xl"
                style={{ borderColor: horse.assigned_color }}
              />
            ) : (
              <div
                className="w-32 h-32 rounded-2xl flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900 border-4 shadow-xl"
                style={{ borderColor: horse.assigned_color }}
              >
                <svg
                  className="w-16 h-16 text-slate-600"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M20 8h-2.81c-.45-.78-1.07-1.45-1.82-1.96L17 4.41 15.59 3l-2.17 2.17C12.96 5.06 12.49 5 12 5c-.49 0-.96.06-1.42.17L8.41 3 7 4.41l1.62 1.63C7.88 6.55 7.26 7.22 6.81 8H4v2h2.09c-.05.33-.09.66-.09 1v1H4v2h2v1c0 .34.04.67.09 1H4v2h2.81c1.04 1.79 2.97 3 5.19 3s4.15-1.21 5.19-3H20v-2h-2.09c.05-.33.09-.66.09-1v-1h2v-2h-2v-1c0-.34-.04-.67-.09-1H20V8zm-6 8h-4v-2h4v2zm0-4h-4v-2h4v2z" />
                </svg>
              </div>
            )}

            {/* Tracking ID Badge */}
            <div
              className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-sm font-bold shadow-lg"
              style={{
                backgroundColor: `${horse.assigned_color}20`,
                borderColor: horse.assigned_color,
                borderWidth: '2px',
                color: horse.assigned_color,
              }}
            >
              #{trackingNumber}
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Name Field */}
          <div>
            <label
              htmlFor="horse-name"
              className="block text-sm font-medium text-slate-300 mb-2"
            >
              Horse Name
            </label>
            <input
              id="horse-name"
              type="text"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              disabled={isSubmitting}
              className={`w-full px-4 py-2.5 bg-slate-800/50 border rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 transition-all ${
                errors.name
                  ? 'border-red-500/50 focus:ring-red-500/50 focus:border-red-500/50'
                  : 'border-slate-700/50 focus:ring-cyan-500/50 focus:border-cyan-500/50'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
              placeholder={`e.g., Thunder, Spirit, Horse #${trackingNumber}`}
            />
            <div className="flex items-center justify-between mt-1">
              {errors.name ? (
                <p className="text-xs text-red-400">{errors.name}</p>
              ) : (
                <p className="text-xs text-slate-500">
                  Give your horse a memorable name
                </p>
              )}
              <p className="text-xs text-slate-500">
                {formData.name.length}/100
              </p>
            </div>
          </div>

          {/* Notes Field */}
          <div>
            <label
              htmlFor="horse-notes"
              className="block text-sm font-medium text-slate-300 mb-2"
            >
              Notes (Optional)
            </label>
            <textarea
              id="horse-notes"
              value={formData.notes}
              onChange={e =>
                setFormData({ ...formData, notes: e.target.value })
              }
              disabled={isSubmitting}
              rows={4}
              className={`w-full px-4 py-2.5 bg-slate-800/50 border rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 transition-all resize-none ${
                errors.notes
                  ? 'border-red-500/50 focus:ring-red-500/50 focus:border-red-500/50'
                  : 'border-slate-700/50 focus:ring-cyan-500/50 focus:border-cyan-500/50'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
              placeholder="Add notes about this horse (breed, color, markings, behavior, etc.)"
            />
            <div className="flex items-center justify-between mt-1">
              {errors.notes ? (
                <p className="text-xs text-red-400">{errors.notes}</p>
              ) : (
                <p className="text-xs text-slate-500">
                  Additional information about this horse
                </p>
              )}
              <p className="text-xs text-slate-500">
                {formData.notes.length}/500
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 text-slate-300 rounded-lg hover:bg-slate-800 hover:border-slate-600/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-4 py-2.5 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <svg
                    className="w-5 h-5 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-8 right-8 px-6 py-4 rounded-lg shadow-2xl backdrop-blur-sm flex items-center gap-3 animate-slide-up ${
            toast.type === 'success'
              ? 'bg-emerald-600/90 border border-emerald-500/50'
              : 'bg-red-600/90 border border-red-500/50'
          }`}
        >
          {toast.type === 'success' ? (
            <svg
              className="w-6 h-6 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          ) : (
            <svg
              className="w-6 h-6 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          )}
          <p className="text-white font-medium">{toast.message}</p>
        </div>
      )}
    </div>
  );
};
