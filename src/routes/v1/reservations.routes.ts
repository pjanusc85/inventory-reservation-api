import { Router } from 'express';
import { ReservationController } from '../../controllers/reservation.controller';
import { ReservationService } from '../../services/reservation.service';
import { ReservationRepository } from '../../repositories/reservation.repository';
import { ItemRepository } from '../../repositories/item.repository';
import { validate } from '../../middleware/validation.middleware';
import {
  createReservationSchema,
  confirmReservationSchema,
  cancelReservationSchema,
  getReservationSchema,
} from '../../validators/reservation.validator';
import { getSupabaseClient } from '../../config/database';

/**
 * Reservation routes (v1)
 */
const router = Router();

// Initialize dependencies
const supabaseClient = getSupabaseClient();
const reservationRepository = new ReservationRepository(supabaseClient);
const itemRepository = new ItemRepository(supabaseClient);
const reservationService = new ReservationService(reservationRepository, itemRepository);
const reservationController = new ReservationController(reservationService);

/**
 * @swagger
 * /v1/reservations:
 *   post:
 *     summary: Create a new reservation
 *     tags: [Reservations]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - item_id
 *               - customer_id
 *               - quantity
 *             properties:
 *               item_id:
 *                 type: string
 *                 format: uuid
 *               customer_id:
 *                 type: string
 *               quantity:
 *                 type: integer
 *                 minimum: 1
 *     responses:
 *       201:
 *         description: Reservation created successfully
 *       409:
 *         description: Insufficient quantity available
 */
router.post('/', validate(createReservationSchema), reservationController.createReservation);

/**
 * @swagger
 * /v1/reservations/{id}:
 *   get:
 *     summary: Get reservation by ID
 *     tags: [Reservations]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Reservation retrieved successfully
 *       404:
 *         description: Reservation not found
 */
router.get('/:id', validate(getReservationSchema), reservationController.getReservation);

/**
 * @swagger
 * /v1/reservations/{id}/confirm:
 *   post:
 *     summary: Confirm a reservation
 *     tags: [Reservations]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Reservation confirmed successfully
 *       404:
 *         description: Reservation not found
 *       409:
 *         description: Cannot confirm (expired or invalid status)
 */
router.post('/:id/confirm', validate(confirmReservationSchema), reservationController.confirmReservation);

/**
 * @swagger
 * /v1/reservations/{id}/cancel:
 *   post:
 *     summary: Cancel a reservation
 *     tags: [Reservations]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Reservation cancelled successfully
 *       404:
 *         description: Reservation not found
 *       409:
 *         description: Cannot cancel (confirmed)
 */
router.post('/:id/cancel', validate(cancelReservationSchema), reservationController.cancelReservation);

export default router;
