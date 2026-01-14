import { ReservationRepository } from '../repositories/reservation.repository';
import { ExpireReservationsResult } from '../types/reservation.types';
import { logger } from '../config/logger';

/**
 * Maintenance Service
 *
 * Handles maintenance operations like expiring old reservations
 */
export class MaintenanceService {
  constructor(private reservationRepo: ReservationRepository) {}

  /**
   * Expire old pending reservations
   *
   * Finds all PENDING reservations where expires_at <= NOW()
   * and marks them as EXPIRED
   *
   * Safe to run concurrently - each reservation expired exactly once
   * through atomic database operation
   *
   * Returns count and IDs of expired reservations
   */
  async expireReservations(): Promise<ExpireReservationsResult> {
    logger.info('Running expire reservations job');

    const result = await this.reservationRepo.expireReservations();

    logger.info('Expire reservations job complete', {
      expiredCount: result.expiredCount,
    });

    return result;
  }
}
