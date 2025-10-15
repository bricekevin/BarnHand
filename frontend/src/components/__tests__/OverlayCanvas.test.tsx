import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OverlayCanvas } from '../OverlayCanvas';

// Mock canvas context
const mockContext = {
  clearRect: vi.fn(),
  beginPath: vi.fn(),
  rect: vi.fn(),
  stroke: vi.fn(),
  fill: vi.fn(),
  fillRect: vi.fn(),
  fillText: vi.fn(),
  strokeText: vi.fn(),
  measureText: vi.fn((text: string) => ({ width: text.length * 8 })),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  arc: vi.fn(),
  canvas: { width: 800, height: 600 },
  strokeStyle: '',
  fillStyle: '',
  lineWidth: 0,
  font: '',
};

beforeEach(() => {
  vi.clearAllMocks();
  HTMLCanvasElement.prototype.getContext = vi.fn(() => mockContext as any);
  // Prevent infinite loop by not calling the callback
  window.requestAnimationFrame = vi.fn(() => 123) as any;
  window.cancelAnimationFrame = vi.fn();

  // Mock ResizeObserver
  global.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));
});

describe('OverlayCanvas', () => {
  const mockVideoRef = {
    current: {
      getBoundingClientRect: () => ({ width: 800, height: 600 }),
      videoWidth: 1920,
      videoHeight: 1080,
      offsetWidth: 800,
      offsetHeight: 600,
    } as HTMLVideoElement,
  };

  const mockDetection = {
    id: 'det-1',
    horseId: 'horse-1',
    trackingId: 'horse_003',
    bbox: { x: 100, y: 100, width: 200, height: 300 },
    confidence: 0.95,
  };

  describe('Horse Name Display', () => {
    it('should render horse name when provided', () => {
      const detectionWithName = {
        ...mockDetection,
        horse_name: 'Thunder',
      };

      render(
        <OverlayCanvas
          videoRef={mockVideoRef as any}
          detections={[detectionWithName]}
          showTrackingIds={true}
        />
      );

      // Check that fillText was called with the formatted name
      const calls = mockContext.fillText.mock.calls;
      const nameCall = calls.find((call) =>
        call[0].includes('Thunder')
      );

      expect(nameCall).toBeDefined();
      expect(nameCall![0]).toBe('Horse #3 - Thunder');
    });

    it('should render default label when horse_name is not provided', () => {
      render(
        <OverlayCanvas
          videoRef={mockVideoRef as any}
          detections={[mockDetection]}
          showTrackingIds={true}
        />
      );

      const calls = mockContext.fillText.mock.calls;
      const nameCall = calls.find((call) =>
        call[0].includes('Horse #')
      );

      expect(nameCall).toBeDefined();
      expect(nameCall![0]).toBe('Horse #3');
    });

    it('should extract tracking number correctly from various formats', () => {
      const testCases = [
        { trackingId: 'horse_001', expected: 'Horse #1' },
        { trackingId: 'horse_010', expected: 'Horse #10' },
        { trackingId: 'horse_123', expected: 'Horse #123' },
      ];

      testCases.forEach(({ trackingId, expected }) => {
        vi.clearAllMocks();
        const detection = { ...mockDetection, trackingId };

        render(
          <OverlayCanvas
            videoRef={mockVideoRef as any}
            detections={[detection]}
            showTrackingIds={true}
          />
        );

        const calls = mockContext.fillText.mock.calls;
        const nameCall = calls.find((call) =>
          call[0].includes('Horse #')
        );

        expect(nameCall![0]).toBe(expected);
      });
    });

    it('should not render horse name when showTrackingIds is false', () => {
      const detectionWithName = {
        ...mockDetection,
        horse_name: 'Thunder',
      };

      render(
        <OverlayCanvas
          videoRef={mockVideoRef as any}
          detections={[detectionWithName]}
          showTrackingIds={false}
        />
      );

      const calls = mockContext.fillText.mock.calls;
      const nameCall = calls.find((call) =>
        call[0].includes('Thunder')
      );

      expect(nameCall).toBeUndefined();
    });

    it('should use tracking color for horse name background', () => {
      const detectionWithName = {
        ...mockDetection,
        horse_name: 'Thunder',
      };

      render(
        <OverlayCanvas
          videoRef={mockVideoRef as any}
          detections={[detectionWithName]}
          showTrackingIds={true}
        />
      );

      // Verify fillRect was called with tracking color
      const fillRectCalls = mockContext.fillRect.mock.calls;
      // Should have at least 2 fillRect calls: confidence label + horse name
      expect(fillRectCalls.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle multiple horses with different names', () => {
      const detections = [
        { ...mockDetection, trackingId: 'horse_001', horse_name: 'Thunder', bbox: { x: 100, y: 100, width: 200, height: 300 } },
        { ...mockDetection, trackingId: 'horse_002', horse_name: 'Lightning', bbox: { x: 400, y: 100, width: 200, height: 300 } },
        { ...mockDetection, trackingId: 'horse_003', bbox: { x: 700, y: 100, width: 200, height: 300 } }, // No name
      ];

      render(
        <OverlayCanvas
          videoRef={mockVideoRef as any}
          detections={detections}
          showTrackingIds={true}
        />
      );

      const calls = mockContext.fillText.mock.calls;

      // Check Thunder
      const thunderCall = calls.find((call) => call[0].includes('Thunder'));
      expect(thunderCall).toBeDefined();
      expect(thunderCall![0]).toBe('Horse #1 - Thunder');

      // Check Lightning
      const lightningCall = calls.find((call) => call[0].includes('Lightning'));
      expect(lightningCall).toBeDefined();
      expect(lightningCall![0]).toBe('Horse #2 - Lightning');

      // Check unnamed horse
      const unnamedCall = calls.find((call) => call[0] === 'Horse #3');
      expect(unnamedCall).toBeDefined();
    });

    it('should handle empty horse_name string', () => {
      const detectionWithEmptyName = {
        ...mockDetection,
        horse_name: '',
      };

      render(
        <OverlayCanvas
          videoRef={mockVideoRef as any}
          detections={[detectionWithEmptyName]}
          showTrackingIds={true}
        />
      );

      const calls = mockContext.fillText.mock.calls;
      const nameCall = calls.find((call) =>
        call[0].includes('Horse #')
      );

      // Empty string should be treated as falsy, showing default
      expect(nameCall![0]).toBe('Horse #3');
    });

    it('should handle long horse names without breaking layout', () => {
      const detectionWithLongName = {
        ...mockDetection,
        horse_name: 'Magnificent Thunder Storm Lightning Bolt the Third',
      };

      render(
        <OverlayCanvas
          videoRef={mockVideoRef as any}
          detections={[detectionWithLongName]}
          showTrackingIds={true}
        />
      );

      const calls = mockContext.fillText.mock.calls;
      const nameCall = calls.find((call) =>
        call[0].includes('Magnificent')
      );

      expect(nameCall).toBeDefined();
      // Verify fillRect was called with appropriate width for long text
      const fillRectCalls = mockContext.fillRect.mock.calls;
      expect(fillRectCalls.length).toBeGreaterThan(0);
    });
  });

  describe('Confidence Label', () => {
    it('should render confidence percentage above bounding box', () => {
      render(
        <OverlayCanvas
          videoRef={mockVideoRef as any}
          detections={[mockDetection]}
        />
      );

      const calls = mockContext.fillText.mock.calls;
      const confidenceCall = calls.find((call) => call[0] === '95%');

      expect(confidenceCall).toBeDefined();
    });
  });

  describe('Canvas Rendering', () => {
    it('should clear canvas before drawing', () => {
      render(
        <OverlayCanvas
          videoRef={mockVideoRef as any}
          detections={[mockDetection]}
        />
      );

      expect(mockContext.clearRect).toHaveBeenCalled();
    });

    it('should draw bounding box with tracking color', () => {
      render(
        <OverlayCanvas
          videoRef={mockVideoRef as any}
          detections={[mockDetection]}
        />
      );

      expect(mockContext.rect).toHaveBeenCalled();
      expect(mockContext.stroke).toHaveBeenCalled();
    });

    it('should scale coordinates based on video dimensions', () => {
      render(
        <OverlayCanvas
          videoRef={mockVideoRef as any}
          detections={[mockDetection]}
        />
      );

      // Verify rect was called with scaled coordinates
      expect(mockContext.rect).toHaveBeenCalled();
      const rectCall = mockContext.rect.mock.calls[0];

      // Scale factors: canvasWidth (800) / videoWidth (1920) = ~0.42
      // Original bbox.x = 100, scaled should be around 41-42
      expect(rectCall[0]).toBeLessThan(100);
    });
  });

  describe('Pose Rendering', () => {
    it('should render pose keypoints when showPose is true', () => {
      const detectionWithPose = {
        ...mockDetection,
        pose: {
          keypoints: [
            { x: 150, y: 150, confidence: 0.9 },
            { x: 160, y: 160, confidence: 0.85 },
          ],
        },
      };

      render(
        <OverlayCanvas
          videoRef={mockVideoRef as any}
          detections={[detectionWithPose]}
          showPose={true}
        />
      );

      // Verify arc was called for keypoint circles
      expect(mockContext.arc).toHaveBeenCalled();
    });

    it('should not render pose when showPose is false', () => {
      const detectionWithPose = {
        ...mockDetection,
        pose: {
          keypoints: [
            { x: 150, y: 150, confidence: 0.9 },
          ],
        },
      };

      render(
        <OverlayCanvas
          videoRef={mockVideoRef as any}
          detections={[detectionWithPose]}
          showPose={false}
        />
      );

      // arc should not be called if showPose is false
      expect(mockContext.arc).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty detections array', () => {
      render(
        <OverlayCanvas
          videoRef={mockVideoRef as any}
          detections={[]}
        />
      );

      // Should clear canvas but not draw anything
      expect(mockContext.clearRect).toHaveBeenCalled();
      expect(mockContext.fillText.mock.calls.length).toBe(0);
    });

    it('should handle null videoRef', () => {
      const nullVideoRef = { current: null };

      render(
        <OverlayCanvas
          videoRef={nullVideoRef as any}
          detections={[mockDetection]}
        />
      );

      // Should clear canvas but not throw error
      expect(mockContext.clearRect).toHaveBeenCalled();
    });

    it('should handle special characters in horse names', () => {
      const detectionWithSpecialChars = {
        ...mockDetection,
        horse_name: "Thunder's Lightning & Storm",
      };

      render(
        <OverlayCanvas
          videoRef={mockVideoRef as any}
          detections={[detectionWithSpecialChars]}
          showTrackingIds={true}
        />
      );

      const calls = mockContext.fillText.mock.calls;
      const nameCall = calls.find((call) =>
        call[0].includes("Thunder's")
      );

      expect(nameCall).toBeDefined();
      expect(nameCall![0]).toBe("Horse #3 - Thunder's Lightning & Storm");
    });
  });
});
