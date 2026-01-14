import { SupabaseClient } from '@supabase/supabase-js';
import { Item, ItemRow, ItemWithAvailability } from '../types/item.types';
import { logger } from '../config/logger';

/**
 * Item Repository
 *
 * Handles all database operations for items table
 */
export class ItemRepository {
  constructor(private client: SupabaseClient) {}

  /**
   * Create a new item
   */
  async create(name: string, totalQuantity: number): Promise<Item> {
    logger.debug('Creating item', { name, totalQuantity });

    const { data, error } = await this.client
      .from('items')
      .insert({
        name,
        total_quantity: totalQuantity,
      })
      .select()
      .single();

    if (error) {
      logger.error('Failed to create item', { error: error.message });
      throw new Error(`Failed to create item: ${error.message}`);
    }

    return this.mapToItem(data);
  }

  /**
   * Find item by ID
   */
  async findById(id: string): Promise<Item | null> {
    const { data, error } = await this.client.from('items').select('*').eq('id', id).single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      logger.error('Failed to find item', { id, error: error.message });
      throw new Error(`Failed to find item: ${error.message}`);
    }

    return data ? this.mapToItem(data) : null;
  }

  /**
   * Get item with availability calculations
   *
   * Calculates:
   * - total_quantity
   * - reserved_quantity (pending & unexpired)
   * - confirmed_quantity
   * - available_quantity (total - reserved - confirmed)
   */
  async findByIdWithAvailability(id: string): Promise<ItemWithAvailability | null> {
    // First check if item exists
    const item = await this.findById(id);
    if (!item) return null;

    // Calculate reserved quantity (pending and not expired)
    const { data: reservedData, error: reservedError } = await this.client
      .from('reservations')
      .select('quantity')
      .eq('item_id', id)
      .eq('status', 'PENDING')
      .gt('expires_at', new Date().toISOString());

    if (reservedError) {
      logger.error('Failed to calculate reserved quantity', { error: reservedError.message });
      throw new Error(`Failed to calculate reserved quantity: ${reservedError.message}`);
    }

    const reservedQuantity = reservedData?.reduce((sum, r) => sum + (r.quantity || 0), 0) || 0;

    // Calculate confirmed quantity
    const { data: confirmedData, error: confirmedError } = await this.client
      .from('reservations')
      .select('quantity')
      .eq('item_id', id)
      .eq('status', 'CONFIRMED');

    if (confirmedError) {
      logger.error('Failed to calculate confirmed quantity', { error: confirmedError.message });
      throw new Error(`Failed to calculate confirmed quantity: ${confirmedError.message}`);
    }

    const confirmedQuantity = confirmedData?.reduce((sum, r) => sum + (r.quantity || 0), 0) || 0;

    const availableQuantity = item.totalQuantity - reservedQuantity - confirmedQuantity;

    return {
      ...item,
      availableQuantity,
      reservedQuantity,
      confirmedQuantity,
    };
  }

  /**
   * Get reserved quantity for an item
   * (Active pending reservations only)
   */
  async getReservedQuantity(itemId: string): Promise<number> {
    const { data, error } = await this.client
      .from('reservations')
      .select('quantity')
      .eq('item_id', itemId)
      .eq('status', 'PENDING')
      .gt('expires_at', new Date().toISOString());

    if (error) {
      logger.error('Failed to get reserved quantity', { error: error.message });
      throw new Error(`Failed to get reserved quantity: ${error.message}`);
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
      .eq('status', 'CONFIRMED');

    if (error) {
      logger.error('Failed to get confirmed quantity', { error: error.message });
      throw new Error(`Failed to get confirmed quantity: ${error.message}`);
    }

    return data?.reduce((sum, r) => sum + (r.quantity || 0), 0) || 0;
  }

  /**
   * Map database row to domain model
   */
  private mapToItem(row: ItemRow): Item {
    return {
      id: row.id,
      name: row.name,
      totalQuantity: row.total_quantity,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
