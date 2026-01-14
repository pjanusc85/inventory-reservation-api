/**
 * API request and response types
 */

// Success response wrapper
export interface ApiSuccessResponse<T> {
  data: T;
  message?: string;
}

// Error response wrapper
export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

// Health check response
export interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  database: 'connected' | 'disconnected';
  uptime: number;
}

// Pagination params
export interface PaginationParams {
  limit: number;
  offset: number;
}

// Paginated response
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
}
