// Local type definitions for database layer

export interface Farm {
  id: string;
  name: string;
  owner_id: string;
  location?: any;
  timezone: string;
  expected_horse_count?: number;
  metadata: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface Stream {
  id: string;
  farm_id: string;
  name: string;
  source_type: 'youtube' | 'rtsp' | 'rtmp' | 'file' | 'local';
  source_url: string;
  status: 'active' | 'inactive' | 'processing' | 'error';
  processing_delay: number;
  chunk_duration: number;
  config: Record<string, any>;
  health_check_url?: string;
  last_health_check?: Date;
  created_at: Date;
  updated_at: Date;
}

export interface CreateStreamRequest {
  farm_id: string;
  name: string;
  source_type: 'youtube' | 'rtsp' | 'rtmp' | 'file' | 'local';
  source_url: string;
  processing_delay?: number;
  chunk_duration?: number;
  config?: Record<string, any>;
}

export interface StreamConfig {
  name: string;
  source_type: 'youtube' | 'rtsp' | 'rtmp' | 'file' | 'local';
  source_url: string;
  processing_delay: number;
  chunk_duration: number;
  config?: Record<string, any>;
}

export interface Horse {
  id: string;
  stream_id?: string;
  name?: string;
  tracking_id?: string;
  ui_color?: string;  // Maps to color_hex in DB
  feature_vector?: number[];
  thumbnail_url?: string;
  avatar_thumbnail?: string; // base64 encoded JPEG
  first_detected?: Date;
  last_seen?: Date;
  total_detections?: number;
  confidence_score?: number;  // Maps to track_confidence in DB
  metadata?: Record<string, any>;
  status?: 'active' | 'deleted';
  // Official horse designation
  is_official?: boolean;
  made_official_at?: Date;
  made_official_by?: string;
  // Optional fields from JOINs for display purposes
  stream_name?: string;
}

export interface CreateHorseRequest {
  stream_id?: string;
  name?: string;
  tracking_id?: string;
  ui_color?: string;  // Maps to color_hex in DB
  avatar_thumbnail?: Buffer;
  metadata?: Record<string, any>;
}

export interface HorseDetection {
  time: Date;
  stream_id: string;
  chunk_id?: string;
  horse_id?: string;
  tracking_id?: string;
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
    confidence: number;
  };
  pose_keypoints?: Array<{
    x: number;
    y: number;
    confidence: number;
  }>;
  pose_angles?: Record<string, number>;
  gait_type?: 'walk' | 'trot' | 'canter' | 'gallop';
  velocity?: number;
  acceleration?: number;
  confidence: number;
  processing_time_ms?: number;
  model_version?: string;
  metadata?: Record<string, any>;
}

export interface CreateDetectionRequest {
  time?: Date;
  stream_id: string;
  chunk_id?: string;
  horse_id?: string;
  tracking_id?: string;
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
    confidence: number;
  };
  pose_keypoints?: Array<{
    x: number;
    y: number;
    confidence: number;
  }>;
  pose_angles?: Record<string, number>;
  gait_type?: 'walk' | 'trot' | 'canter' | 'gallop';
  velocity?: number;
  acceleration?: number;
  confidence: number;
  processing_time_ms?: number;
  model_version?: string;
  metadata?: Record<string, any>;
}

// Phase 4: Detection Correction Types
export interface DetectionCorrection {
  id: string;
  chunk_id: string;
  detection_index: number;
  frame_index: number;
  correction_type: 'reassign' | 'new_guest' | 'mark_incorrect';
  original_horse_id?: string;
  corrected_horse_id?: string;
  corrected_horse_name?: string;
  user_id?: string;
  created_at: Date;
  applied_at?: Date;
  status: 'pending' | 'applied' | 'failed';
  error_message?: string;
}

export interface CreateCorrectionRequest {
  chunk_id: string;
  detection_index: number;
  frame_index: number;
  correction_type: 'reassign' | 'new_guest' | 'mark_incorrect';
  original_horse_id?: string;
  corrected_horse_id?: string;
  corrected_horse_name?: string;
  user_id?: string;
}

export type CorrectionType = 'reassign' | 'new_guest' | 'mark_incorrect';
export type CorrectionStatus = 'pending' | 'applied' | 'failed';

// Generate UUID v4 (simplified version)
export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
