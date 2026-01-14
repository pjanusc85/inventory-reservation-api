/**
 * Item domain types
 */

export interface Item {
  id: string;
  name: string;
  totalQuantity: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ItemWithAvailability extends Item {
  availableQuantity: number;
  reservedQuantity: number;
  confirmedQuantity: number;
}

// Database row type (snake_case from PostgreSQL)
export interface ItemRow {
  id: string;
  name: string;
  total_quantity: number;
  created_at: string;
  updated_at: string;
}

// Create item input
export interface CreateItemInput {
  name: string;
  initialQuantity: number;
}

// Item availability breakdown
export interface ItemAvailability {
  totalQuantity: number;
  availableQuantity: number;
  reservedQuantity: number;
  confirmedQuantity: number;
}
