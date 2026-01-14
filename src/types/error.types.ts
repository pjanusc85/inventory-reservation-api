/**
 * Error types and codes
 */

// Standard error codes
export enum ErrorCode {
  // Validation errors (400)
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',

  // Not found errors (404)
  ITEM_NOT_FOUND = 'ITEM_NOT_FOUND',
  RESERVATION_NOT_FOUND = 'RESERVATION_NOT_FOUND',

  // Conflict errors (409)
  INSUFFICIENT_QUANTITY = 'INSUFFICIENT_QUANTITY',
  RESERVATION_EXPIRED = 'RESERVATION_EXPIRED',
  INVALID_STATUS_TRANSITION = 'INVALID_STATUS_TRANSITION',
  CONFIRMATION_FAILED = 'CONFIRMATION_FAILED',
  CANCELLATION_FAILED = 'CANCELLATION_FAILED',

  // Server errors (500)
  DATABASE_ERROR = 'DATABASE_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

// Custom application error class
export class AppError extends Error {
  constructor(
    public code: ErrorCode | string,
    message: string,
    public statusCode: number = 500,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}
