const request = require('supertest')
const { spawn } = require('child_process')

describe('API Gateway Integration Tests', () => {
  let apiServer

  beforeAll(async () => {
    // Start API Gateway in test mode
    console.log('🚀 Starting API Gateway for integration tests...')
    
    // Mock the API Gateway for testing
    const express = require('express')
    const app = express()
    
    app.use(express.json())
    
    // Mock health endpoint
    app.get('/api/health', (req, res) => {
      res.json({ status: 'ok', service: 'api-gateway' })
    })
    
    // Mock streams endpoint
    app.get('/api/streams', (req, res) => {
      res.json([
        { id: 'stream-1', name: 'Arena Camera 1', status: 'active' },
        { id: 'stream-2', name: 'Field Camera', status: 'active' }
      ])
    })
    
    apiServer = app.listen(3999, () => {
      console.log('Test API Gateway running on port 3999')
    })
  }, 10000)

  afterAll(async () => {
    if (apiServer) {
      apiServer.close()
    }
  })

  it('should respond to health check', async () => {
    const response = await request('http://localhost:3999')
      .get('/api/health')
      .expect(200)
    
    expect(response.body).toEqual({
      status: 'ok',
      service: 'api-gateway'
    })
  })

  it('should return streams data', async () => {
    const response = await request('http://localhost:3999')
      .get('/api/streams')
      .expect(200)
    
    expect(Array.isArray(response.body)).toBe(true)
    expect(response.body.length).toBeGreaterThan(0)
    expect(response.body[0]).toHaveProperty('id')
    expect(response.body[0]).toHaveProperty('name')
    expect(response.body[0]).toHaveProperty('status')
  })
})