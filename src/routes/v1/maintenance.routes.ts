import { Router } from 'express';
import { MaintenanceController } from '../../controllers/maintenance.controller';
import { MaintenanceService } from '../../services/maintenance.service';
import { ReservationRepository } from '../../repositories/reservation.repository';
import { getSupabaseClient } from '../../config/database';

/**
 * Maintenance routes (v1)
 */
const router = Router();

// Initialize dependencies
const supabaseClient = getSupabaseClient();
const reservationRepository = new ReservationRepository(supabaseClient);
const maintenanceService = new MaintenanceService(reservationRepository);
const maintenanceController = new MaintenanceController(maintenanceService);

/**
 * @swagger
 * /v1/maintenance/expire-reservations:
 *   post:
 *     summary: Expire old pending reservations
 *     tags: [Maintenance]
 *     responses:
 *       200:
 *         description: Reservations expired successfully
 */
router.post('/expire-reservations', maintenanceController.expireReservations);

export default router;
