/**
 * Reservation domain types
 */

// Reservation status enum
export enum ReservationStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
}

export interface Reservation {
  id: string;
  itemId: string;
  customerId: string;
  quantity: number;
  status: ReservationStatus;
  expiresAt: Date;
  createdAt: Date;
  confirmedAt?: Date;
  cancelledAt?: Date;
  expiredAt?: Date;
}

// Database row type (snake_case from PostgreSQL)
export interface ReservationRow {
  id: string;
  item_id: string;
  customer_id: string;
  quantity: number;
  status: string;
  expires_at: string;
  created_at: string;
  confirmed_at: string | null;
  cancelled_at: string | null;
  expired_at: string | null;
}

// Create reservation input
export interface CreateReservationInput {
  itemId: string;
  customerId: string;
  quantity: number;
}

// Reservation creation params (internal, includes expiry)
export interface CreateReservationParams {
  itemId: string;
  customerId: string;
  quantity: number;
  expiresAt: Date;
}

// Expire reservations result
export interface ExpireReservationsResult {
  expiredCount: number;
  expiredReservationIds: string[];
}
