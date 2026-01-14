import { ItemRepository } from '../repositories/item.repository';
import { Item, ItemWithAvailability, CreateItemInput } from '../types/item.types';
import { AppError, ErrorCode } from '../types/error.types';
import { logger } from '../config/logger';

/**
 * Item Service
 *
 * Business logic for item operations
 */
export class ItemService {
  constructor(private itemRepo: ItemRepository) {}

  /**
   * Create a new item
   */
  async createItem(input: CreateItemInput): Promise<Item> {
    logger.info('Creating item', input);

    const item = await this.itemRepo.create(input.name, input.initialQuantity);

    logger.info('Item created successfully', { itemId: item.id });
    return item;
  }

  /**
   * Get item by ID with availability breakdown
   *
   * Returns:
   * - total_quantity
   * - available_quantity (free to reserve)
   * - reserved_quantity (held in pending reservations)
   * - confirmed_quantity (permanently allocated)
   */
  async getItemWithAvailability(id: string): Promise<ItemWithAvailability> {
    logger.debug('Getting item with availability', { id });

    const item = await this.itemRepo.findByIdWithAvailability(id);

    if (!item) {
      throw new AppError(ErrorCode.ITEM_NOT_FOUND, `Item with ID ${id} not found`, 404);
    }

    return item;
  }

  /**
   * Get item by ID (basic info only)
   */
  async getItem(id: string): Promise<Item> {
    logger.debug('Getting item', { id });

    const item = await this.itemRepo.findById(id);

    if (!item) {
      throw new AppError(ErrorCode.ITEM_NOT_FOUND, `Item with ID ${id} not found`, 404);
    }

    return item;
  }
}
