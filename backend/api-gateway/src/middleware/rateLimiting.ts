import rateLimit from 'express-rate-limit';

import { env, isTest } from '../config/env';
import { logger } from '../config/logger';

// General API rate limiting
export const apiRateLimit = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS, // 15 minutes default
  max: env.RATE_LIMIT_MAX_REQUESTS, // 1000 requests per window default
  message: {
    error: 'Too many requests',
    retryAfter: `${env.RATE_LIMIT_WINDOW_MS / 1000} seconds`,
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => isTest, // Skip rate limiting entirely in test environment
  handler: (req, res) => {
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('user-agent'),
      path: req.path,
    });

    res.status(429).json({
      error: 'Too many requests',
      retryAfter: `${env.RATE_LIMIT_WINDOW_MS / 1000} seconds`,
    });
  },
});

// Strict rate limiting for authentication endpoints
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isTest ? 1000 : 10, // Disable rate limiting in test environment
  message: {
    error: 'Too many authentication attempts',
    retryAfter: '900 seconds',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip: (req) => isTest, // Skip rate limiting entirely in test environment
  handler: (req, res) => {
    logger.warn('Auth rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('user-agent'),
      endpoint: req.path,
    });

    res.status(429).json({
      error: 'Too many authentication attempts',
      retryAfter: '900 seconds',
    });
  },
});

// Heavy operation rate limiting (uploads, processing)
export const heavyOperationRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 operations per minute
  message: {
    error: 'Too many heavy operations',
    retryAfter: '60 seconds',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Heavy operation rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('user-agent'),
      endpoint: req.path,
    });

    res.status(429).json({
      error: 'Too many heavy operations',
      retryAfter: '60 seconds',
    });
  },
});
