const request = require('supertest')
const fs = require('fs')
const path = require('path')

describe('ML Service Integration Tests', () => {
  const ML_SERVICE_URL = 'http://localhost:8002'
  
  // Skip if ML service is not running
  let serviceAvailable = false
  
  beforeAll(async () => {
    try {
      const response = await request(ML_SERVICE_URL)
        .get('/health')
        .timeout(2000)
      
      serviceAvailable = response.status === 200
      console.log(`ML Service status: ${serviceAvailable ? '✅ Available' : '❌ Unavailable'}`)
    } catch (error) {
      console.log('⚠️  ML Service not running - tests will be skipped')
      serviceAvailable = false
    }
  })

  it('should respond to health check', async () => {
    if (!serviceAvailable) {
      console.log('⏭️  Skipping - ML Service not available')
      return
    }

    const response = await request(ML_SERVICE_URL)
      .get('/health')
      .expect(200)
    
    expect(response.body).toHaveProperty('status')
    expect(response.body).toHaveProperty('service', 'ml-service')
  })

  it('should handle detection requests', async () => {
    if (!serviceAvailable) {
      console.log('⏭️  Skipping - ML Service not available')
      return
    }

    // Create a simple test image (1x1 pixel base64)
    const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAI9jU77yQAAAABJRU5ErkJggg=='
    
    const response = await request(ML_SERVICE_URL)
      .post('/api/detect')
      .send({
        image: testImageBase64,
        stream_id: 'test-stream'
      })
      .expect(200)
    
    expect(response.body).toHaveProperty('detections')
    expect(Array.isArray(response.body.detections)).toBe(true)
  })

  it('should provide tracker statistics', async () => {
    if (!serviceAvailable) {
      console.log('⏭️  Skipping - ML Service not available')
      return
    }

    const response = await request(ML_SERVICE_URL)
      .get('/api/tracker/stats')
      .expect(200)
    
    expect(response.body).toHaveProperty('total_tracks')
    expect(response.body).toHaveProperty('confirmed_tracks')
    expect(response.body).toHaveProperty('frame_count')
  })
})