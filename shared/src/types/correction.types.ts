import { z } from 'zod';

/**
 * Phase 4: Detection Correction & Re-Processing Types
 *
 * These types support manual correction of horse detection assignments
 * and the subsequent automatic re-processing of video chunks.
 */

// ===== Enums =====

/**
 * Type of correction being applied to a detection
 * - reassign: Move detection to an existing horse
 * - new_guest: Create a new guest horse for this detection
 * - mark_incorrect: Remove this detection (false positive)
 */
export const CorrectionTypeSchema = z.enum([
  'reassign',
  'new_guest',
  'mark_incorrect',
]);

/**
 * Status of a correction request
 * - pending: Correction queued, not yet applied
 * - applied: Re-processing complete, correction applied successfully
 * - failed: Re-processing failed, see error_message
 */
export const CorrectionStatusSchema = z.enum(['pending', 'applied', 'failed']);

// ===== Core Correction Data =====

/**
 * Database record for a single detection correction
 */
export const DetectionCorrectionSchema = z.object({
  id: z.string().uuid(),
  chunk_id: z.string().uuid(),
  detection_index: z.number().int().min(0),
  frame_index: z.number().int().min(0),
  correction_type: CorrectionTypeSchema,
  original_horse_id: z.string().max(255).optional(),
  corrected_horse_id: z.string().max(255).optional(),
  corrected_horse_name: z.string().max(255).optional(),
  user_id: z.string().uuid().optional(),
  created_at: z.string().datetime(),
  applied_at: z.string().datetime().optional(),
  status: CorrectionStatusSchema,
  error_message: z.string().optional(),
});

// ===== API Payloads =====

/**
 * Payload for a single correction (from frontend)
 * This is what users submit when they want to correct a detection
 */
export const CorrectionPayloadSchema = z
  .object({
    detection_index: z.number().int().min(0),
    frame_index: z.number().int().min(0),
    correction_type: CorrectionTypeSchema,
    original_horse_id: z.string().max(255),
    corrected_horse_id: z.string().max(255).optional(),
    corrected_horse_name: z.string().max(255).optional(),
  })
  .refine(
    data => {
      // Reassign type requires corrected_horse_id
      if (data.correction_type === 'reassign') {
        return !!data.corrected_horse_id;
      }
      // New guest type requires corrected_horse_name
      if (data.correction_type === 'new_guest') {
        return !!data.corrected_horse_name;
      }
      // Mark incorrect doesn't require either
      return true;
    },
    {
      message:
        'Invalid correction: reassign requires corrected_horse_id, new_guest requires corrected_horse_name',
    }
  );

/**
 * Batch correction request (array of corrections for single chunk)
 */
export const BatchCorrectionRequestSchema = z.object({
  corrections: z.array(CorrectionPayloadSchema).min(1).max(50),
});

/**
 * Response after submitting corrections (202 Accepted)
 */
export const CorrectionResponseSchema = z.object({
  message: z.string(),
  reprocessing_url: z.string().url(),
  corrections_count: z.number().int().min(0),
  chunk_id: z.string().uuid(),
});

// ===== Re-Processing Types =====

/**
 * Re-processing status enum
 */
export const ReprocessingStatusSchema = z.enum([
  'idle',
  'pending',
  'running',
  'completed',
  'failed',
]);

/**
 * Real-time re-processing progress update (via WebSocket)
 */
export const ReprocessingProgressSchema = z.object({
  chunk_id: z.string().uuid(),
  status: ReprocessingStatusSchema,
  progress: z.number().min(0).max(100),
  current_step: z.string(),
  error: z.string().optional(),
  started_at: z.string().datetime().optional(),
  completed_at: z.string().datetime().optional(),
});

/**
 * Final re-processing result
 */
export const ReprocessingResultSchema = z.object({
  chunk_id: z.string().uuid(),
  corrections_applied: z.number().int().min(0),
  frames_updated: z.number().int().min(0),
  horses_affected: z.number().int().min(0),
  duration_ms: z.number().min(0),
  status: ReprocessingStatusSchema,
  error: z.string().optional(),
});

// ===== UI State Types =====

/**
 * Frontend pending correction (before submission)
 * Used by Zustand store to track corrections before user clicks "Process"
 */
export const PendingCorrectionSchema = z
  .object({
    id: z.string().uuid(), // Temporary client-side ID
    detection_index: z.number().int().min(0),
    frame_index: z.number().int().min(0),
    correction_type: CorrectionTypeSchema,
    original_horse_id: z.string().max(255),
    corrected_horse_id: z.string().max(255).optional(),
    corrected_horse_name: z.string().max(255).optional(),
    created_at: z.string().datetime(),
  })
  .refine(
    data => {
      // Reassign type requires corrected_horse_id
      if (data.correction_type === 'reassign') {
        return !!data.corrected_horse_id;
      }
      // New guest type requires corrected_horse_name
      if (data.correction_type === 'new_guest') {
        return !!data.corrected_horse_name;
      }
      // Mark incorrect doesn't require either
      return true;
    },
    {
      message:
        'Invalid correction: reassign requires corrected_horse_id, new_guest requires corrected_horse_name',
    }
  );

/**
 * Summary of a correction for display in batch panel
 */
export const CorrectionSummarySchema = z.object({
  frame_index: z.number().int().min(0),
  correction_type: CorrectionTypeSchema,
  original_horse_name: z.string(),
  target_description: z.string(), // e.g., "Horse 2", "New Guest", "Deleted"
});

// ===== Export Types =====

export type CorrectionType = z.infer<typeof CorrectionTypeSchema>;
export type CorrectionStatus = z.infer<typeof CorrectionStatusSchema>;
export type DetectionCorrection = z.infer<typeof DetectionCorrectionSchema>;
export type CorrectionPayload = z.infer<typeof CorrectionPayloadSchema>;
export type BatchCorrectionRequest = z.infer<
  typeof BatchCorrectionRequestSchema
>;
export type CorrectionResponse = z.infer<typeof CorrectionResponseSchema>;
export type ReprocessingStatus = z.infer<typeof ReprocessingStatusSchema>;
export type ReprocessingProgress = z.infer<typeof ReprocessingProgressSchema>;
export type ReprocessingResult = z.infer<typeof ReprocessingResultSchema>;
export type PendingCorrection = z.infer<typeof PendingCorrectionSchema>;
export type CorrectionSummary = z.infer<typeof CorrectionSummarySchema>;

// ===== Helper Functions =====

/**
 * Validate that a correction payload is well-formed
 */
export function validateCorrection(payload: unknown): CorrectionPayload {
  return CorrectionPayloadSchema.parse(payload);
}

/**
 * Validate batch correction request
 */
export function validateBatchCorrections(
  payload: unknown
): BatchCorrectionRequest {
  return BatchCorrectionRequestSchema.parse(payload);
}

/**
 * Generate a summary description for a correction
 */
export function generateCorrectionSummary(
  correction: CorrectionPayload
): string {
  switch (correction.correction_type) {
    case 'reassign':
      return `Frame ${correction.frame_index}: ${correction.original_horse_id} → ${correction.corrected_horse_id} (Reassign)`;
    case 'new_guest':
      return `Frame ${correction.frame_index}: ${correction.original_horse_id} → ${correction.corrected_horse_name} (New Guest)`;
    case 'mark_incorrect':
      return `Frame ${correction.frame_index}: ${correction.original_horse_id} → Deleted (Mark Incorrect)`;
    default:
      return `Frame ${correction.frame_index}: Unknown correction`;
  }
}
