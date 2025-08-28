import bcrypt from 'bcrypt';
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

import { env } from '../config/env';
import { logger } from '../config/logger';
import { authenticateToken, generateTokens } from '../middleware/auth';
import { authRateLimit } from '../middleware/rateLimiting';
import { validateSchema } from '../middleware/validation';
import { UserRole, JwtPayload } from '../types/auth';
import { AuthenticatedRequest } from '../types/requests';

// TODO: Replace with actual user service/repository when implemented
interface MockUser {
  id: string;
  email: string;
  password: string;
  name: string;
  role: string;
  farm_id?: string;
}

// Mock user store (replace with database integration)
const mockUsers: MockUser[] = [
  {
    id: '123e4567-e89b-12d3-a456-426614174000',
    email: 'admin@barnhand.com',
    password: '$2b$10$rOzJJKz.QtGV8j1qYqJ0eO5Y9Pt6YfHr.ckGy1JvQq8h0gJ2K3h1u', // 'admin123'
    name: 'System Administrator',
    role: 'super_admin',
  },
  {
    id: '123e4567-e89b-12d3-a456-426614174001',
    email: 'farm@example.com',
    password: '$2b$10$rOzJJKz.QtGV8j1qYqJ0eO5Y9Pt6YfHr.ckGy1JvQq8h0gJ2K3h1u', // 'admin123'
    name: 'Farm Manager',
    role: 'farm_admin',
    farm_id: '123e4567-e89b-12d3-a456-426614174010',
  },
];

// Validation schemas
const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token required'),
});

const router = Router();

// Apply auth rate limiting to all auth routes
router.use(authRateLimit);

// POST /api/v1/auth/login
router.post('/login', validateSchema(loginSchema), async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user (replace with database query)
    const user = mockUsers.find(u => u.email === email);
    if (!user) {
      logger.warn('Login attempt with invalid email', { email });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      logger.warn('Login attempt with invalid password', { userId: user.id });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate tokens
    const payload = {
      userId: user.id,
      email: user.email,
      role: user.role as UserRole,
      farmId: user.farm_id,
    };

    const { accessToken, refreshToken } = generateTokens(payload);

    logger.info('User logged in successfully', {
      userId: user.id,
      email: user.email,
    });

    return res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        farm_id: user.farm_id,
      },
      accessToken,
      refreshToken,
      expiresIn: '24h',
    });
  } catch (error) {
    logger.error('Login error', { error });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/auth/refresh
router.post('/refresh', validateSchema(refreshSchema), async (req, res) => {
  try {
    const { refreshToken } = req.body;

    // Verify refresh token
    const payload = jwt.verify(refreshToken, env.JWT_SECRET) as JwtPayload;

    // Generate new access token
    const { accessToken: newAccessToken } = generateTokens({
      userId: payload.userId,
      email: payload.email,
      role: payload.role,
      farmId: payload.farmId,
    });

    return res.json({
      accessToken: newAccessToken,
      expiresIn: '24h',
    });
  } catch (error) {
    logger.warn('Invalid refresh token', {
      error: error instanceof Error ? error.message : error,
    });
    return res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// GET /api/v1/auth/me - Get current user info
router.get('/me', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    // Find user (replace with database query)
    const user = mockUsers.find(u => u.id === req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      farm_id: user.farm_id,
    });
  } catch (error) {
    logger.error('Get user info error', { error });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/auth/logout
router.post('/logout', authenticateToken, (req: AuthenticatedRequest, res) => {
  // In production, add token to blacklist or revoke refresh tokens
  logger.info('User logged out', { userId: req.user?.userId });
  return res.json({ message: 'Logged out successfully' });
});

export default router;
