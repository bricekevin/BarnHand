import expressWinston from 'express-winston';
import winston from 'winston';

import { env, isDevelopment } from './env';

// Create main logger
export const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    isDevelopment
      ? winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level, message, stack, ...metadata }) => {
            const metaStr = Object.keys(metadata).length > 0 && metadata.timestamp !== timestamp
              ? ' ' + JSON.stringify(metadata)
              : '';
            return `${timestamp} [${level}]: ${message}${metaStr}${stack ? '\n' + stack : ''}`;
          })
        )
      : winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      silent: env.NODE_ENV === 'test',
    }),
  ],
});

// Express request logger middleware
export const requestLogger = expressWinston.logger({
  winstonInstance: logger,
  meta: true,
  msg: 'HTTP {{req.method}} {{req.url}} {{res.statusCode}} {{res.responseTime}}ms',
  expressFormat: true,
  colorize: isDevelopment,
  ignoreRoute: req => {
    // Ignore health check requests to reduce noise
    return req.url === '/api/v1/health';
  },
});

// Express error logger middleware
export const errorLogger = expressWinston.errorLogger({
  winstonInstance: logger,
  meta: true,
  msg: 'HTTP {{req.method}} {{req.url}} {{res.statusCode}} {{res.responseTime}}ms',
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.json()
  ),
});
