import { ReservationRepository } from '../repositories/reservation.repository';
import { ItemRepository } from '../repositories/item.repository';
import { Reservation, CreateReservationInput, ReservationStatus } from '../types/reservation.types';
import { AppError, ErrorCode } from '../types/error.types';
import { logger } from '../config/logger';
import { RESERVATION_EXPIRY_MS } from '../config/environment';

/**
 * Reservation Service
 *
 * Business logic for reservation operations
 * Implements concurrency control to prevent overselling
 */
export class ReservationService {
  constructor(
    private reservationRepo: ReservationRepository,
    private itemRepo: ItemRepository
  ) {}

  /**
   * Create a reservation with concurrency guarantees
   *
   * Concurrency approach:
   * Uses PostgreSQL function create_reservation_atomic() which:
   * 1. Locks the item row with SELECT ... FOR UPDATE
   * 2. Calculates available quantity within the lock
   * 3. Creates reservation if sufficient quantity
   * 4. Releases lock (automatically at end of transaction)
   *
   * Race condition handling:
   * - Multiple concurrent requests are serialized at the database level
   * - Row-level lock ensures only one request can check/modify at a time
   * - Other requests wait in queue, then check availability when lock is released
   * - Zero overselling guaranteed
   *
   * Example: 200 concurrent requests for item with 50 units:
   * - First 50 acquire lock, see 50 available, create reservation, release lock
   * - Remaining 150 acquire lock one by one, see 0 available, return null
   * - Result: Exactly 50 reservations created, 150 get insufficient quantity error
   */
  async createReservation(input: CreateReservationInput): Promise<Reservation> {
    logger.info('Creating reservation', input);

    // Step 1: Verify item exists
    const item = await this.itemRepo.findById(input.itemId);
    if (!item) {
      throw new AppError(ErrorCode.ITEM_NOT_FOUND, `Item with ID ${input.itemId} not found`, 404);
    }

    // Step 2: Create reservation with expiry time
    const expiresAt = new Date(Date.now() + RESERVATION_EXPIRY_MS);

    // Step 3: Call atomic reservation creation (with row locking)
    const reservation = await this.reservationRepo.createAtomic({
      itemId: input.itemId,
      customerId: input.customerId,
      quantity: input.quantity,
      expiresAt,
    });

    // Step 4: Handle insufficient quantity
    if (!reservation) {
      // Get current availability for error message
      const reservedQuantity = await this.reservationRepo.getActiveReservedQuantity(input.itemId);
      const confirmedQuantity = await this.reservationRepo.getConfirmedQuantity(input.itemId);
      const availableQuantity = item.totalQuantity - reservedQuantity - confirmedQuantity;

      logger.debug('Insufficient quantity', {
        itemId: input.itemId,
        total: item.totalQuantity,
        reserved: reservedQuantity,
        confirmed: confirmedQuantity,
        available: availableQuantity,
        requested: input.quantity,
      });

      throw new AppError(
        ErrorCode.INSUFFICIENT_QUANTITY,
        `Cannot reserve ${input.quantity} units. Only ${availableQuantity} available.`,
        409,
        {
          requested: input.quantity,
          available: availableQuantity,
        }
      );
    }

    logger.info('Reservation created successfully', {
      reservationId: reservation.id,
      itemId: input.itemId,
      quantity: input.quantity,
      expiresAt,
    });

    return reservation;
  }

  /**
   * Confirm a reservation (idempotent)
   *
   * Business rules:
   * - Only PENDING reservations can be confirmed
   * - Expired reservations cannot be confirmed
   * - Confirming twice returns success without side effects
   *
   * Idempotency:
   * - If already confirmed, return current state
   * - If expired, throw error
   * - If cancelled, throw error
   */
  async confirmReservation(id: string): Promise<Reservation> {
    logger.info('Confirming reservation', { id });

    // Get current reservation
    const existing = await this.reservationRepo.findById(id);

    if (!existing) {
      throw new AppError(
        ErrorCode.RESERVATION_NOT_FOUND,
        `Reservation with ID ${id} not found`,
        404
      );
    }

    // If already confirmed, return success (idempotent)
    if (existing.status === ReservationStatus.CONFIRMED) {
      logger.debug('Reservation already confirmed', { id });
      return existing;
    }

    // Cannot confirm non-pending reservations
    if (existing.status !== ReservationStatus.PENDING) {
      throw new AppError(
        ErrorCode.INVALID_STATUS_TRANSITION,
        `Cannot confirm ${existing.status} reservation`,
        409,
        { currentStatus: existing.status }
      );
    }

    // Cannot confirm expired reservations
    if (existing.expiresAt < new Date()) {
      throw new AppError(
        ErrorCode.RESERVATION_EXPIRED,
        'Cannot confirm expired reservation',
        409,
        { expiredAt: existing.expiresAt }
      );
    }

    // Atomic confirm operation
    const confirmed = await this.reservationRepo.confirmReservation(id);

    if (!confirmed) {
      // Race condition: reservation changed between checks
      // Re-fetch to get current state
      const current = await this.reservationRepo.findById(id);

      if (current?.status === ReservationStatus.CONFIRMED) {
        // Was confirmed by another request
        return current;
      }

      throw new AppError(
        ErrorCode.CONFIRMATION_FAILED,
        'Failed to confirm reservation (may have been expired or cancelled concurrently)',
        409
      );
    }

    logger.info('Reservation confirmed', { id });
    return confirmed;
  }

  /**
   * Cancel a reservation (idempotent)
   *
   * Business rules:
   * - Only PENDING reservations can be cancelled
   * - Confirmed reservations cannot be cancelled
   * - Cancelling twice returns success without side effects
   *
   * Idempotency:
   * - If already cancelled, return current state
   * - If confirmed, throw error (cannot undo)
   * - If expired, return current state (already released)
   */
  async cancelReservation(id: string): Promise<Reservation> {
    logger.info('Cancelling reservation', { id });

    // Get current reservation
    const existing = await this.reservationRepo.findById(id);

    if (!existing) {
      throw new AppError(
        ErrorCode.RESERVATION_NOT_FOUND,
        `Reservation with ID ${id} not found`,
        404
      );
    }

    // If already cancelled, return success (idempotent)
    if (existing.status === ReservationStatus.CANCELLED) {
      logger.debug('Reservation already cancelled', { id });
      return existing;
    }

    // If expired, return current state (quantity already released)
    if (existing.status === ReservationStatus.EXPIRED) {
      logger.debug('Reservation already expired', { id });
      return existing;
    }

    // Cannot cancel confirmed reservations
    if (existing.status === ReservationStatus.CONFIRMED) {
      throw new AppError(
        ErrorCode.INVALID_STATUS_TRANSITION,
        'Cannot cancel confirmed reservation',
        409,
        { currentStatus: existing.status }
      );
    }

    // Atomic cancel operation
    const cancelled = await this.reservationRepo.cancelReservation(id);

    if (!cancelled) {
      // Race condition: reservation changed between checks
      // Re-fetch to get current state
      const current = await this.reservationRepo.findById(id);

      if (current?.status === ReservationStatus.CANCELLED || current?.status === ReservationStatus.EXPIRED) {
        // Was cancelled/expired by another request
        return current;
      }

      throw new AppError(
        ErrorCode.CANCELLATION_FAILED,
        'Failed to cancel reservation (may have been confirmed or expired concurrently)',
        409
      );
    }

    logger.info('Reservation cancelled', { id });
    return cancelled;
  }

  /**
   * Get reservation by ID
   */
  async getReservation(id: string): Promise<Reservation> {
    logger.debug('Getting reservation', { id });

    const reservation = await this.reservationRepo.findById(id);

    if (!reservation) {
      throw new AppError(
        ErrorCode.RESERVATION_NOT_FOUND,
        `Reservation with ID ${id} not found`,
        404
      );
    }

    return reservation;
  }
}
