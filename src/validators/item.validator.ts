import { z } from 'zod';

/**
 * Item validation schemas
 */

// Create item request schema
export const createItemSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Name is required').max(255, 'Name must be at most 255 characters'),
    initial_quantity: z
      .number({
        required_error: 'Initial quantity is required',
        invalid_type_error: 'Initial quantity must be a number',
      })
      .int('Initial quantity must be an integer')
      .positive('Initial quantity must be positive'),
  }),
});

// Get item by ID schema
export const getItemSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid item ID format'),
  }),
});

// Infer TypeScript types from schemas
export type CreateItemRequest = z.infer<typeof createItemSchema>;
export type GetItemRequest = z.infer<typeof getItemSchema>;
