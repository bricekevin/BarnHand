import winston from 'winston';
import { env, isDevelopment } from './env';

export const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    isDevelopment
      ? winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(({ timestamp, level, message, stack }) => {
            return `${timestamp} [${level}]: ${message}${stack ? '\n' + stack : ''}`;
          })
        )
      : winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      silent: env.NODE_ENV === 'test'
    })
  ]
});