import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';
import { createErrorResponse } from '../utils/response-factory';

/**
 * Validation middleware factory
 *
 * Validates request data (body, params, query) against a Zod schema
 *
 * Usage:
 * ```typescript
 * router.post('/items', validate(createItemSchema), itemController.create);
 * ```
 */
export const validate = (schema: AnyZodObject) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await schema.parseAsync({
        body: req.body,
        params: req.params,
        query: req.query,
      });
      next();
      return;
    } catch (error) {
      if (error instanceof ZodError) {
        const errorDetails = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        }));

        res.status(400).json(
          createErrorResponse('VALIDATION_ERROR', 'Validation failed', {
            errors: errorDetails,
          })
        );
        return;
      }
      next(error);
      return;
    }
  };
};
