import { Request, Response } from 'express';
import { MaintenanceService } from '../services/maintenance.service';
import { createSuccessResponse } from '../utils/response-factory';
import { asyncHandler } from '../utils/async-handler';

/**
 * Maintenance Controller
 *
 * HTTP request handlers for maintenance endpoints
 */
export class MaintenanceController {
  constructor(private maintenanceService: MaintenanceService) {}

  /**
   * POST /v1/maintenance/expire-reservations
   * Expire old pending reservations
   */
  expireReservations = asyncHandler(async (_req: Request, res: Response) => {
    const result = await this.maintenanceService.expireReservations();

    res
      .status(200)
      .json(
        createSuccessResponse(result, `Successfully expired ${result.expiredCount} reservations`)
      );
  });
}
