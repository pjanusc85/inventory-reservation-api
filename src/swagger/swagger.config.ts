import swaggerJsdoc from 'swagger-jsdoc';
import { env } from '../config/environment';

/**
 * Swagger/OpenAPI Configuration
 *
 * Generates OpenAPI 3.0 specification from JSDoc comments in route files
 */
const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Inventory Reservation API',
      version: '1.0.0',
      description: `
A REST API for managing inventory with temporary reservations.

## Features
- Create and manage inventory items
- Create temporary reservations with automatic expiration
- Confirm or cancel reservations
- Strong concurrency guarantees to prevent overselling
- Automatic expiration of old pending reservations

## Concurrency Guarantees
The API maintains the invariant: \`confirmed_quantity + pending_quantity ≤ total_quantity\`

This is enforced through:
- Atomic database operations with status checks
- Optimistic concurrency control
- Database constraints as fallback protection
- Idempotent operations (safe to retry)

## Reservation Lifecycle
1. **PENDING**: Initial state when reservation is created (expires in ${env.RESERVATION_EXPIRY_MINUTES} minutes)
2. **CONFIRMED**: Customer completes purchase (permanent)
3. **CANCELLED**: Customer cancels reservation (releases inventory)
4. **EXPIRED**: Reservation expires automatically (releases inventory)
      `.trim(),
      contact: {
        name: 'API Support',
      },
    },
    servers: [
      {
        url: env.NODE_ENV === 'production'
          ? 'https://your-app.vercel.app'
          : `http://localhost:${env.PORT}`,
        description: env.NODE_ENV === 'production' ? 'Production server' : 'Development server',
      },
    ],
    tags: [
      {
        name: 'Items',
        description: 'Inventory item management',
      },
      {
        name: 'Reservations',
        description: 'Reservation lifecycle operations',
      },
      {
        name: 'Maintenance',
        description: 'System maintenance operations',
      },
    ],
    components: {
      schemas: {
        Item: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'Unique item identifier',
            },
            name: {
              type: 'string',
              description: 'Item name',
            },
            total_quantity: {
              type: 'integer',
              minimum: 0,
              description: 'Total quantity in inventory',
            },
            available_quantity: {
              type: 'integer',
              minimum: 0,
              description: 'Quantity available for new reservations',
            },
            reserved_quantity: {
              type: 'integer',
              minimum: 0,
              description: 'Quantity currently in pending reservations',
            },
            confirmed_quantity: {
              type: 'integer',
              minimum: 0,
              description: 'Quantity in confirmed reservations',
            },
            created_at: {
              type: 'string',
              format: 'date-time',
            },
            updated_at: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        Reservation: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'Unique reservation identifier',
            },
            item_id: {
              type: 'string',
              format: 'uuid',
              description: 'Item being reserved',
            },
            customer_id: {
              type: 'string',
              description: 'Customer identifier',
            },
            quantity: {
              type: 'integer',
              minimum: 1,
              description: 'Quantity reserved',
            },
            status: {
              type: 'string',
              enum: ['PENDING', 'CONFIRMED', 'CANCELLED', 'EXPIRED'],
              description: 'Reservation status',
            },
            expires_at: {
              type: 'string',
              format: 'date-time',
              description: 'When this reservation expires (if pending)',
            },
            created_at: {
              type: 'string',
              format: 'date-time',
            },
            confirmed_at: {
              type: 'string',
              format: 'date-time',
              nullable: true,
            },
            cancelled_at: {
              type: 'string',
              format: 'date-time',
              nullable: true,
            },
            expired_at: {
              type: 'string',
              format: 'date-time',
              nullable: true,
            },
          },
        },
        Error: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false,
            },
            error: {
              type: 'object',
              properties: {
                code: {
                  type: 'string',
                  description: 'Error code',
                },
                message: {
                  type: 'string',
                  description: 'Human-readable error message',
                },
                details: {
                  type: 'object',
                  description: 'Additional error details',
                },
              },
            },
          },
        },
      },
    },
  },
  apis: ['./src/routes/**/*.ts'], // Path to route files with JSDoc comments
};

export const swaggerSpec = swaggerJsdoc(options);
