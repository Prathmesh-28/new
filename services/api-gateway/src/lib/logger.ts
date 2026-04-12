import pino from 'pino';

const isDevelopment = process.env.NODE_ENV === 'development';

export const logger = pino(isDevelopment ? {
  level: 'debug',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      ignore: 'pid,hostname',
      singleLine: false,
    },
  },
} : {
  level: process.env.LOG_LEVEL || 'info',
});
