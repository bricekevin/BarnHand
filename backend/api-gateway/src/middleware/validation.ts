import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { ZodSchema, ZodError } from 'zod';

import { logger } from '../config/logger';

// Express Validator Error Handler
export const handleValidationErrors = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logger.warn('Validation errors', {
      path: req.path,
      method: req.method,
      errors: errors.array(),
    });

    res.status(400).json({
      error: 'Validation failed',
      details: errors.array().map(error => ({
        field: error.type === 'field' ? error.path : 'unknown',
        message: error.msg,
        value: error.type === 'field' ? error.value : undefined,
      })),
    });
    return;
  }
  next();
};

// Zod Schema Validation Middleware
export const validateSchema = <T>(
  schema: ZodSchema<T>,
  source: 'body' | 'query' | 'params' = 'body'
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const data =
        source === 'body'
          ? req.body
          : source === 'query'
            ? req.query
            : req.params;

      const validated = schema.parse(data);

      if (source === 'body') {
        req.body = validated;
      } else if (source === 'query') {
        req.query = validated as Record<string, any>;
      } else {
        req.params = validated as Record<string, any>;
      }

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        logger.warn('Schema validation failed', {
          path: req.path,
          method: req.method,
          errors: error.errors,
        });

        res.status(400).json({
          error: 'Invalid request data',
          details: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
            code: err.code,
          })),
        });
        return;
      }

      logger.error('Schema validation error', { error });
      res.status(500).json({ error: 'Internal validation error' });
    }
  };
};

// Request size limit middleware
export const validateRequestSize = (maxSizeMB: number = 10) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const contentLength = parseInt(req.get('content-length') || '0');
    const maxBytes = maxSizeMB * 1024 * 1024;

    if (contentLength > maxBytes) {
      res.status(413).json({
        error: 'Request too large',
        maxSize: `${maxSizeMB}MB`,
        receivedSize: `${(contentLength / 1024 / 1024).toFixed(2)}MB`,
      });
      return;
    }

    next();
  };
};
