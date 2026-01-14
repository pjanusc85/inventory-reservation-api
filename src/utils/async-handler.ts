import { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Async handler wrapper
 *
 * Wraps async route handlers and catches errors, passing them to Express error middleware
 *
 * Usage:
 * ```typescript
 * router.post('/items', asyncHandler(async (req, res, next) => {
 *   const item = await itemService.create(req.body);
 *   res.json(createSuccessResponse(item));
 * }));
 * ```
 */
export const asyncHandler = (fn: RequestHandler): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
