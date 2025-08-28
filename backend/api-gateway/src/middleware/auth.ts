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
): void => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: 'Access token required' });
    return;
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    req.user = payload;
    next();
  } catch (error) {
    logger.warn('Invalid JWT token', {
      error: error instanceof Error ? error.message : error,
    });
    res.status(403).json({ error: 'Invalid or expired token' });
  }
};

// Role-based Access Control
export const requireRole = (allowedRoles: UserRole[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      logger.warn('Insufficient permissions', {
        userId: req.user.userId,
        userRole: req.user.role,
        requiredRoles: allowedRoles,
      });
      res.status(403).json({
        error: 'Insufficient permissions',
        required: allowedRoles,
        current: req.user.role,
      });
      return;
    }

    next();
  };
};

// Farm Access Control - ensure users can only access their farm's data
export const requireFarmAccess = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  // Super admins can access any farm
  if (req.user.role === UserRole.SUPER_ADMIN) {
    next();
    return;
  }

  const farmId = req.params.farmId || req.body.farm_id || req.query.farm_id;

  if (!farmId) {
    res.status(400).json({ error: 'Farm ID required' });
    return;
  }

  if (req.user.farmId !== farmId) {
    logger.warn('Farm access denied', {
      userId: req.user.userId,
      userFarmId: req.user.farmId,
      requestedFarmId: farmId,
    });
    res.status(403).json({ error: 'Access denied to this farm' });
    return;
  }

  next();
};

// Generate JWT tokens
export const generateTokens = (payload: Omit<JwtPayload, 'iat' | 'exp'>) => {
  const accessToken = jwt.sign(payload as object, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  });

  const refreshToken = jwt.sign(payload as object, env.JWT_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
  });

  return { accessToken, refreshToken };
};
