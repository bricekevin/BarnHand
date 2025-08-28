import { rest } from 'msw'

export const handlers = [
  // Mock API Gateway health check
  rest.get('http://localhost:8000/health', (req, res, ctx) => {
    return res(
      ctx.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
          database: 'connected',
          redis: 'connected',
          ml_service: 'healthy'
        }
      })
    )
  }),

  // Mock stream endpoints
  rest.get('http://localhost:8001/api/v1/streams', (req, res, ctx) => {
    return res(
      ctx.json([
        {
          id: 'stream-1',
          name: 'Arena Camera 1',
          status: 'active',
          type: 'youtube',
          url: 'https://youtube.com/watch?v=test',
          horses: 3
        },
        {
          id: 'stream-2', 
          name: 'Field Camera',
          status: 'active',
          type: 'rtsp',
          url: 'rtsp://camera.test/stream',
          horses: 2
        }
      ])
    )
  }),

  // Mock ML service detection endpoint
  rest.post('http://localhost:8002/api/v1/detect', (req, res, ctx) => {
    return res(
      ctx.json({
        detections: [
          {
            bbox: [100, 100, 200, 200],
            confidence: 0.92,
            class_id: 0,
            class_name: 'horse'
          }
        ],
        processing_time: 23.4,
        model_used: 'yolo11'
      })
    )
  }),

  // Mock tracking endpoint  
  rest.post('http://localhost:8002/api/v1/tracking', (req, res, ctx) => {
    return res(
      ctx.json({
        success: true,
        horses: [
          {
            id: 'horse-1',
            tracking_id: 1,
            color: [0, 183, 235],
            bbox: [100, 100, 200, 200],
            confidence: 0.92
          }
        ],
        tracker_stats: {
          total_tracks: 1,
          confirmed_tracks: 1,
          frame_count: 100
        }
      })
    )
  }),

  // Mock WebSocket connection (for testing WebSocket service)
  rest.get('ws://localhost:8000/ws', (req, res, ctx) => {
    return res(ctx.status(200))
  })
]