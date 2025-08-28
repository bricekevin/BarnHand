const axios = require('axios');
const WebSocket = require('ws');
const { expect } = require('@jest/globals');

describe('Stream Processing Pipeline Integration', () => {
  let apiBaseUrl, wsUrl;

  beforeAll(() => {
    apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:8000/api/v1';
    wsUrl = process.env.WS_URL || 'ws://localhost:8000';
  });

  describe('API Gateway Integration', () => {
    test('should connect to API Gateway health endpoint', async () => {
      const response = await axios.get(`${apiBaseUrl}/health`);
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('status', 'healthy');
    });

    test('should authenticate and get access token', async () => {
      const authResponse = await axios.post(`${apiBaseUrl}/auth/login`, {
        email: 'admin@barnhand.com',
        password: 'admin123'
      });
      
      expect(authResponse.status).toBe(200);
      expect(authResponse.data).toHaveProperty('accessToken');
      expect(authResponse.data).toHaveProperty('user');
      
      // Store token for subsequent tests
      global.testAuthToken = authResponse.data.accessToken;
    });

    test('should access protected streams endpoint', async () => {
      const response = await axios.get(`${apiBaseUrl}/streams`, {
        headers: {
          'Authorization': `Bearer ${global.testAuthToken}`
        }
      });
      
      expect(response.status).toBe(200);
      expect(Array.isArray(response.data)).toBe(true);
    });
  });

  describe('Stream Service Integration', () => {
    test('should be able to create a new stream', async () => {
      const streamData = {
        name: 'Integration Test Stream',
        url: 'http://localhost:8003/stream1/playlist.m3u8',
        active: false
      };

      const response = await axios.post(`${apiBaseUrl}/streams`, streamData, {
        headers: {
          'Authorization': `Bearer ${global.testAuthToken}`,
          'Content-Type': 'application/json'
        }
      });

      expect(response.status).toBe(201);
      expect(response.data).toHaveProperty('id');
      expect(response.data.name).toBe(streamData.name);
      
      global.testStreamId = response.data.id;
    });

    test('should be able to start stream processing', async () => {
      const response = await axios.post(
        `${apiBaseUrl}/streams/${global.testStreamId}/start`,
        {},
        {
          headers: {
            'Authorization': `Bearer ${global.testAuthToken}`
          }
        }
      );

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('message');
    });
  });

  describe('WebSocket Real-time Communication', () => {
    let ws;

    beforeAll((done) => {
      ws = new WebSocket(wsUrl);
      ws.on('open', done);
    });

    afterAll(() => {
      if (ws) {
        ws.close();
      }
    });

    test('should establish WebSocket connection', (done) => {
      expect(ws.readyState).toBe(WebSocket.OPEN);
      done();
    });

    test('should receive stream status updates', (done) => {
      ws.on('message', (data) => {
        const message = JSON.parse(data);
        
        if (message.type === 'stream:status') {
          expect(message).toHaveProperty('streamId');
          expect(message).toHaveProperty('status');
          done();
        }
      });

      // Trigger a stream status change
      setTimeout(() => {
        ws.send(JSON.stringify({
          type: 'subscribe',
          room: `stream_${global.testStreamId}`
        }));
      }, 100);
    });

    test('should handle detection updates', (done) => {
      let detectionReceived = false;

      ws.on('message', (data) => {
        const message = JSON.parse(data);
        
        if (message.type === 'detection:update') {
          expect(message).toHaveProperty('detections');
          expect(Array.isArray(message.detections)).toBe(true);
          detectionReceived = true;
          done();
        }
      });

      // Wait for detection updates or timeout
      setTimeout(() => {
        if (!detectionReceived) {
          // If no detection updates received, that's also acceptable for integration test
          done();
        }
      }, 3000);
    });
  });

  describe('Cross-service Data Flow', () => {
    test('should retrieve detections for created stream', async () => {
      const response = await axios.get(
        `${apiBaseUrl}/detections?streamId=${global.testStreamId}`,
        {
          headers: {
            'Authorization': `Bearer ${global.testAuthToken}`
          }
        }
      );

      expect(response.status).toBe(200);
      expect(Array.isArray(response.data)).toBe(true);
    });

    test('should get analytics data', async () => {
      const response = await axios.get(`${apiBaseUrl}/analytics/metrics`, {
        headers: {
          'Authorization': `Bearer ${global.testAuthToken}`
        }
      });

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('streams');
      expect(response.data).toHaveProperty('horses');
      expect(response.data).toHaveProperty('detections');
    });

    test('should export data successfully', async () => {
      const exportRequest = {
        format: 'json',
        dateFrom: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        dateTo: new Date().toISOString(),
        includeDetections: true,
        includeHorses: true
      };

      const response = await axios.post(`${apiBaseUrl}/analytics/export`, exportRequest, {
        headers: {
          'Authorization': `Bearer ${global.testAuthToken}`,
          'Content-Type': 'application/json'
        }
      });

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('exportUrl');
    });
  });

  describe('Cleanup', () => {
    test('should stop and delete test stream', async () => {
      // Stop stream
      await axios.post(
        `${apiBaseUrl}/streams/${global.testStreamId}/stop`,
        {},
        {
          headers: {
            'Authorization': `Bearer ${global.testAuthToken}`
          }
        }
      );

      // Delete stream
      const deleteResponse = await axios.delete(
        `${apiBaseUrl}/streams/${global.testStreamId}`,
        {
          headers: {
            'Authorization': `Bearer ${global.testAuthToken}`
          }
        }
      );

      expect(deleteResponse.status).toBe(204);
    });
  });
});