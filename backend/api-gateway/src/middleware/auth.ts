import { Request, Response, NextFunction, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';

import { env } from '../config/env';
import { logger } from '../config/logger';
import { UserRole, JwtPayload } from '../types/auth';

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

// Type-safe authenticated route handler wrapper
export type AuthenticatedHandler<
  P = Record<string, string>,
  ResBody = unknown,
  ReqBody = unknown,
  ReqQuery = Record<string, unknown>,
> = (
  req: AuthenticatedRequest & Request<P, ResBody, ReqBody, ReqQuery>,
  res: Response<ResBody>,
  next: NextFunction
) => Promise<Response<ResBody> | void> | Response<ResBody> | void;

// Helper to create type-safe authenticated routes
export const createAuthenticatedRoute = <
  P = Record<string, string>,
  ResBody = unknown,
  ReqBody = unknown,
  ReqQuery = Record<string, unknown>,
>(
  handler: AuthenticatedHandler<P, ResBody, ReqBody, ReqQuery>
): RequestHandler<P, ResBody, ReqBody, ReqQuery> => {
  return (req, res, next) => {
    const authReq = req as AuthenticatedRequest &
      Request<P, ResBody, ReqBody, ReqQuery>;
    return handler(authReq, res, next);
  };
};

// JWT Authentication Middleware
export const authenticateToken = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;
  const headerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  // Also check query parameter for image requests (since img tags can't send headers)
  const queryToken = req.query.token as string | undefined;

  const token = headerToken || queryToken;

  if (!token) {
    res.status(401).json({ error: 'Access token required' });
    return;
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    (req as AuthenticatedRequest).user = payload;
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
  return (req: Request, res: Response, next: NextFunction): void => {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!allowedRoles.includes(authReq.user.role)) {
      logger.warn('Insufficient permissions', {
        userId: authReq.user.userId,
        userRole: authReq.user.role,
        requiredRoles: allowedRoles,
      });
      res.status(403).json({
        error: 'Insufficient permissions',
        required: allowedRoles,
        current: authReq.user.role,
      });
      return;
    }

    next();
  };
};

// Farm Access Control - ensure users can only access their farm's data
export const requireFarmAccess = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const authReq = req as AuthenticatedRequest;
  if (!authReq.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  // Super admins can access any farm
  if (authReq.user.role === UserRole.SUPER_ADMIN) {
    next();
    return;
  }

  const farmId = req.params.farmId || req.body.farm_id || req.query.farm_id;

  if (!farmId) {
    res.status(400).json({ error: 'Farm ID required' });
    return;
  }

  if (authReq.user.farmId !== farmId) {
    logger.warn('Farm access denied', {
      userId: authReq.user.userId,
      userFarmId: authReq.user.farmId,
      requestedFarmId: farmId,
    });
    res.status(403).json({ error: 'Access denied to this farm' });
    return;
  }

  next();
};

// Generate JWT tokens
export const generateTokens = (payload: Omit<JwtPayload, 'iat' | 'exp'>) => {
  const tokenPayload = {
    userId: payload.userId,
    email: payload.email,
    role: payload.role,
    farmId: payload.farmId,
  };

  const accessToken = jwt.sign(tokenPayload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  });

  const refreshToken = jwt.sign(tokenPayload, env.JWT_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
  });

  return { accessToken, refreshToken };
};
