import { ApiSuccessResponse, ApiErrorResponse } from '../types/api.types';

/**
 * Create a standardized success response
 */
export function createSuccessResponse<T>(data: T, message?: string): ApiSuccessResponse<T> {
  const response: ApiSuccessResponse<T> = { data };

  if (message) {
    response.message = message;
  }

  return response;
}

/**
 * Create a standardized error response
 */
export function createErrorResponse(
  code: string,
  message: string,
  details?: Record<string, unknown>
): ApiErrorResponse {
  return {
    error: {
      code,
      message,
      ...(details && { details }),
    },
  };
}
