import { Request, Response } from 'express';
import { ReservationService } from '../services/reservation.service';
import { createSuccessResponse } from '../utils/response-factory';
import { asyncHandler } from '../utils/async-handler';

/**
 * Reservation Controller
 *
 * HTTP request handlers for reservation endpoints
 */
export class ReservationController {
  constructor(private reservationService: ReservationService) {}

  /**
   * POST /v1/reservations
   * Create a new reservation
   */
  createReservation = asyncHandler(async (req: Request, res: Response) => {
    const { item_id, customer_id, quantity } = req.body;

    const reservation = await this.reservationService.createReservation({
      itemId: item_id,
      customerId: customer_id,
      quantity,
    });

    res.status(201).json(createSuccessResponse(reservation));
  });

  /**
   * POST /v1/reservations/:id/confirm
   * Confirm a reservation
   */
  confirmReservation = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const reservation = await this.reservationService.confirmReservation(id!);

    res.status(200).json(createSuccessResponse(reservation));
  });

  /**
   * POST /v1/reservations/:id/cancel
   * Cancel a reservation
   */
  cancelReservation = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const reservation = await this.reservationService.cancelReservation(id!);

    res.status(200).json(createSuccessResponse(reservation));
  });

  /**
   * GET /v1/reservations/:id
   * Get reservation by ID
   */
  getReservation = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const reservation = await this.reservationService.getReservation(id!);

    res.status(200).json(createSuccessResponse(reservation));
  });
}
