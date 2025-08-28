import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

import { env } from '../config/env';
import { logger } from '../config/logger';
import { UserRole, JwtPayload } from '../types/auth';

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

// JWT Authentication Middleware
export const authenticateToken = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    req.user = payload;
    next();
  } catch (error) {
    logger.warn('Invalid JWT token', {
      error: error instanceof Error ? error.message : error,
    });
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

// Role-based Access Control
export const requireRole = (allowedRoles: UserRole[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      logger.warn('Insufficient permissions', {
        userId: req.user.userId,
        userRole: req.user.role,
        requiredRoles: allowedRoles,
      });
      return res.status(403).json({
        error: 'Insufficient permissions',
        required: allowedRoles,
        current: req.user.role,
      });
    }

    next();
  };
};

// Farm Access Control - ensure users can only access their farm's data
export const requireFarmAccess = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Super admins can access any farm
  if (req.user.role === UserRole.SUPER_ADMIN) {
    return next();
  }

  const farmId = req.params.farmId || req.body.farm_id || req.query.farm_id;

  if (!farmId) {
    return res.status(400).json({ error: 'Farm ID required' });
  }

  if (req.user.farmId !== farmId) {
    logger.warn('Farm access denied', {
      userId: req.user.userId,
      userFarmId: req.user.farmId,
      requestedFarmId: farmId,
    });
    return res.status(403).json({ error: 'Access denied to this farm' });
  }

  next();
};

// Generate JWT tokens
export const generateTokens = (payload: Omit<JwtPayload, 'iat' | 'exp'>) => {
  const accessToken = jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  });

  const refreshToken = jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
  });

  return { accessToken, refreshToken };
};
