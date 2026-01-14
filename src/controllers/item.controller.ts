import { Request, Response } from 'express';
import { ItemService } from '../services/item.service';
import { createSuccessResponse } from '../utils/response-factory';
import { asyncHandler } from '../utils/async-handler';

/**
 * Item Controller
 *
 * HTTP request handlers for item endpoints
 */
export class ItemController {
  constructor(private itemService: ItemService) {}

  /**
   * POST /v1/items
   * Create a new item
   */
  createItem = asyncHandler(async (req: Request, res: Response) => {
    const { name, initial_quantity } = req.body;

    const item = await this.itemService.createItem({
      name,
      initialQuantity: initial_quantity,
    });

    res.status(201).json(createSuccessResponse(item));
  });

  /**
   * GET /v1/items/:id
   * Get item with availability breakdown
   */
  getItem = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const item = await this.itemService.getItemWithAvailability(id!);

    res.status(200).json(createSuccessResponse(item));
  });
}
