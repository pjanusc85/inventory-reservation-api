import { z } from 'zod';

/**
 * Reservation validation schemas
 */

// Create reservation request schema
export const createReservationSchema = z.object({
  body: z.object({
    item_id: z.string().uuid('Invalid item ID format'),
    customer_id: z
      .string()
      .min(1, 'Customer ID is required')
      .max(255, 'Customer ID must be at most 255 characters'),
    quantity: z
      .number({
        required_error: 'Quantity is required',
        invalid_type_error: 'Quantity must be a number',
      })
      .int('Quantity must be an integer')
      .positive('Quantity must be positive'),
  }),
});

// Confirm reservation schema
export const confirmReservationSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid reservation ID format'),
  }),
});

// Cancel reservation schema
export const cancelReservationSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid reservation ID format'),
  }),
});

// Get reservation by ID schema
export const getReservationSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid reservation ID format'),
  }),
});

// Infer TypeScript types from schemas
export type CreateReservationRequest = z.infer<typeof createReservationSchema>;
export type ConfirmReservationRequest = z.infer<typeof confirmReservationSchema>;
export type CancelReservationRequest = z.infer<typeof cancelReservationSchema>;
export type GetReservationRequest = z.infer<typeof getReservationSchema>;
