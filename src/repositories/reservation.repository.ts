import { SupabaseClient } from '@supabase/supabase-js';
import {
  Reservation,
  ReservationRow,
  ReservationStatus,
  CreateReservationParams,
  ExpireReservationsResult,
} from '../types/reservation.types';
import { logger } from '../config/logger';

/**
 * Reservation Repository
 *
 * Handles all database operations for reservations table
 * Implements atomic operations for concurrency control
 */
export class ReservationRepository {
  constructor(private client: SupabaseClient) {}

  /**
   * Create a new reservation using atomic database function
   *
   * Uses create_reservation_atomic PostgreSQL function which:
   * 1. Locks the item row with SELECT ... FOR UPDATE
   * 2. Checks availability within the lock
   * 3. Creates reservation if sufficient quantity
   *
   * This prevents race conditions under concurrent load
   *
   * Returns:
   * - Reservation if successful
   * - null if insufficient quantity
   */
  async createAtomic(params: CreateReservationParams): Promise<Reservation | null> {
    logger.debug('Creating reservation atomically', params);

    try {
      // Call the PostgreSQL function
      const { data: reservationId, error } = await this.client.rpc('create_reservation_atomic', {
        p_item_id: params.itemId,
        p_customer_id: params.customerId,
        p_quantity: params.quantity,
        p_expires_at: params.expiresAt.toISOString(),
      });

      if (error) {
        // Check if it's an "Item not found" error from the function
        if (error.message && error.message.includes('Item not found')) {
          throw new Error(`Item not found: ${params.itemId}`);
        }
        logger.error('Failed to create reservation atomically', {
          error: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        });
        throw new Error(`Failed to create reservation: ${error.message}`);
      }

      // If reservationId is null, it means insufficient quantity
      if (!reservationId) {
        return null;
      }

      // Fetch the created reservation
      const reservation = await this.findById(reservationId);
      if (!reservation) {
        throw new Error('Reservation created but not found');
      }

      return reservation;
    } catch (error) {
      // Re-throw known errors
      if (error instanceof Error) {
        throw error;
      }
      // Handle unexpected errors
      logger.error('Unexpected error in createAtomic', { error });
      throw new Error('Unexpected error creating reservation');
    }
  }

  /**
   * Create a new reservation (non-atomic, legacy)
   * @deprecated Use createAtomic() for proper concurrency control
   */
  async create(params: CreateReservationParams): Promise<Reservation> {
    logger.debug('Creating reservation', params);

    const { data, error } = await this.client
      .from('reservations')
      .insert({
        item_id: params.itemId,
        customer_id: params.customerId,
        quantity: params.quantity,
        status: ReservationStatus.PENDING,
        expires_at: params.expiresAt.toISOString(),
      })
      .select()
      .single();

    if (error) {
      logger.error('Failed to create reservation', { error: error.message });
      throw new Error(`Failed to create reservation: ${error.message}`);
    }

    return this.mapToReservation(data);
  }

  /**
   * Find reservation by ID
   */
  async findById(id: string): Promise<Reservation | null> {
    const { data, error } = await this.client
      .from('reservations')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      logger.error('Failed to find reservation', { id, error: error.message });
      throw new Error(`Failed to find reservation: ${error.message}`);
    }

    return data ? this.mapToReservation(data) : null;
  }

  /**
   * Confirm a reservation (idempotent)
   *
   * Atomic operation: Only updates if status is PENDING and not expired
   * Returns the updated reservation or null if conditions not met
   *
   * This ensures:
   * - Confirming twice doesn't deduct twice (idempotency)
   * - Expired reservations cannot be confirmed
   */
  async confirmReservation(id: string): Promise<Reservation | null> {
    logger.debug('Confirming reservation', { id });

    const { data, error } = await this.client
      .from('reservations')
      .update({
        status: ReservationStatus.CONFIRMED,
        confirmed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('status', ReservationStatus.PENDING)
      .gt('expires_at', new Date().toISOString())
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows updated - reservation doesn't meet conditions
        logger.debug('Reservation not confirmed - conditions not met', { id });
        return null;
      }
      logger.error('Failed to confirm reservation', { id, error: error.message });
      throw new Error(`Failed to confirm reservation: ${error.message}`);
    }

    logger.info('Reservation confirmed', { id });
    return this.mapToReservation(data);
  }

  /**
   * Cancel a reservation (idempotent)
   *
   * Atomic operation: Only updates if status is PENDING
   * Returns the updated reservation or null if already in terminal state
   *
   * This ensures:
   * - Cancelling twice doesn't release twice (idempotency)
   * - Confirmed reservations cannot be cancelled
   */
  async cancelReservation(id: string): Promise<Reservation | null> {
    logger.debug('Cancelling reservation', { id });

    const { data, error } = await this.client
      .from('reservations')
      .update({
        status: ReservationStatus.CANCELLED,
        cancelled_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('status', ReservationStatus.PENDING)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows updated - reservation not pending
        logger.debug('Reservation not cancelled - not pending', { id });
        return null;
      }
      logger.error('Failed to cancel reservation', { id, error: error.message });
      throw new Error(`Failed to cancel reservation: ${error.message}`);
    }

    logger.info('Reservation cancelled', { id });
    return this.mapToReservation(data);
  }

  /**
   * Expire old pending reservations (batch operation)
   *
   * Atomic operation: Updates all PENDING reservations where expires_at <= NOW()
   * Safe to run concurrently - each reservation expired exactly once
   *
   * Returns count and IDs of expired reservations
   */
  async expireReservations(): Promise<ExpireReservationsResult> {
    logger.debug('Expiring old reservations');

    const { data, error } = await this.client
      .from('reservations')
      .update({
        status: ReservationStatus.EXPIRED,
        expired_at: new Date().toISOString(),
      })
      .eq('status', ReservationStatus.PENDING)
      .lte('expires_at', new Date().toISOString())
      .select('id');

    if (error) {
      logger.error('Failed to expire reservations', { error: error.message });
      throw new Error(`Failed to expire reservations: ${error.message}`);
    }

    const expiredIds = data?.map((r) => r.id) || [];
    logger.info('Reservations expired', { count: expiredIds.length });

    return {
      expiredCount: expiredIds.length,
      expiredReservationIds: expiredIds,
    };
  }

  /**
   * Get active (pending, unexpired) reserved quantity for an item
   */
  async getActiveReservedQuantity(itemId: string): Promise<number> {
    const { data, error } = await this.client
      .from('reservations')
      .select('quantity')
      .eq('item_id', itemId)
      .eq('status', ReservationStatus.PENDING)
      .gt('expires_at', new Date().toISOString());

    if (error) {
      logger.error('Failed to get active reserved quantity', { error: error.message });
      throw new Error(`Failed to get active reserved quantity: ${error.message}`);
    }

    return data?.reduce((sum, r) => sum + (r.quantity || 0), 0) || 0;
  }

  /**
   * Get confirmed quantity for an item
   */
  async getConfirmedQuantity(itemId: string): Promise<number> {
    const { data, error } = await this.client
      .from('reservations')
      .select('quantity')
      .eq('item_id', itemId)
      .eq('status', ReservationStatus.CONFIRMED);

    if (error) {
      logger.error('Failed to get confirmed quantity', { error: error.message });
      throw new Error(`Failed to get confirmed quantity: ${error.message}`);
    }

    return data?.reduce((sum, r) => sum + (r.quantity || 0), 0) || 0;
  }

  /**
   * Map database row to domain model
   */
  private mapToReservation(row: ReservationRow): Reservation {
    return {
      id: row.id,
      itemId: row.item_id,
      customerId: row.customer_id,
      quantity: row.quantity,
      status: row.status as ReservationStatus,
      expiresAt: new Date(row.expires_at),
      createdAt: new Date(row.created_at),
      ...(row.confirmed_at && { confirmedAt: new Date(row.confirmed_at) }),
      ...(row.cancelled_at && { cancelledAt: new Date(row.cancelled_at) }),
      ...(row.expired_at && { expiredAt: new Date(row.expired_at) }),
    };
  }
}
