import { Request, Response, NextFunction } from 'express';
import { AppError, ErrorCode } from '../types/error.types';
import { createErrorResponse } from '../utils/response-factory';
import { logger } from '../config/logger';
import { ZodError } from 'zod';

/**
 * Global error handling middleware
 *
 * Catches all errors and returns consistent error responses
 */
export const errorHandler = (err: Error, req: Request, res: Response, _next: NextFunction) => {
  // Log error with context
  logger.error('Error occurred', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    body: req.body,
  });

  // AppError (known application errors)
  if (err instanceof AppError) {
    return res.status(err.statusCode).json(createErrorResponse(err.code, err.message, err.details));
  }

  // Zod validation errors
  if (err instanceof ZodError) {
    return res.status(400).json(
      createErrorResponse(ErrorCode.VALIDATION_ERROR, 'Validation failed', {
        errors: err.errors,
      })
    );
  }

  // PostgreSQL/Supabase errors
  if (err.message.includes('duplicate key')) {
    return res
      .status(409)
      .json(createErrorResponse(ErrorCode.DATABASE_ERROR, 'Duplicate resource'));
  }

  if (err.message.includes('foreign key')) {
    return res
      .status(400)
      .json(createErrorResponse(ErrorCode.DATABASE_ERROR, 'Referenced resource does not exist'));
  }

  // Unknown errors - don't expose internals in production
  return res
    .status(500)
    .json(createErrorResponse(ErrorCode.INTERNAL_ERROR, 'An unexpected error occurred'));
};

/**
 * 404 Not Found handler
 */
export const notFoundHandler = (req: Request, res: Response) => {
  res
    .status(404)
    .json(createErrorResponse('NOT_FOUND', `Route ${req.method} ${req.path} not found`));
};
