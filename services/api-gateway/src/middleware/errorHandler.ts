import { FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../lib/logger.js';

export interface ApiError extends FastifyError {
  statusCode: number;
  message: string;
  code?: string;
  details?: unknown;
}

export class ValidationError extends Error implements ApiError {
  statusCode = 400;
  code = 'VALIDATION_ERROR';
  constructor(message: string, public details?: unknown) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends Error implements ApiError {
  statusCode = 404;
  code = 'NOT_FOUND';
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class UnauthorizedError extends Error implements ApiError {
  statusCode = 401;
  code = 'UNAUTHORIZED';
  constructor(message: string = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends Error implements ApiError {
  statusCode = 403;
  code = 'FORBIDDEN';
  constructor(message: string = 'Forbidden') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class ConflictError extends Error implements ApiError {
  statusCode = 409;
  code = 'CONFLICT';
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

export async function errorHandler(
  error: FastifyError | ApiError | Error,
  request: FastifyRequest,
  reply: FastifyReply
) {
  logger.error({
    err: error,
    method: request.method,
    url: request.url,
    userId: (request as any).user?.userId,
  });

  if ('statusCode' in error) {
    return reply.status(error.statusCode).send({
      error: {
        message: error.message,
        code: (error as ApiError).code || 'INTERNAL_ERROR',
        details: (error as ApiError).details,
      },
    });
  }

  // Default to 500 Internal Server Error
  return reply.status(500).send({
    error: {
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
    },
  });
}
