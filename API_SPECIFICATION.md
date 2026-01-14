# API Specification

## Base URL

**Local Development:** `http://localhost:3000`
**Production (Vercel):** `https://your-app.vercel.app`

## API Versioning

All endpoints are prefixed with `/v1` to support future versioning.

---

## Authentication

**Not required for this assignment.**

In production, you would typically use:
- API keys
- JWT tokens
- OAuth 2.0

---

## Common Response Formats

### Success Response

```json
{
  "data": { ... },
  "message": "Operation successful"
}
```

### Error Response

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": { ... }
  }
}
```

---

## HTTP Status Codes

| Code | Meaning                | Usage                                      |
|------|------------------------|--------------------------------------------|
| 200  | OK                     | Successful GET, POST (non-creation)        |
| 201  | Created                | Successful resource creation               |
| 400  | Bad Request            | Invalid input format                       |
| 404  | Not Found              | Resource doesn't exist                     |
| 409  | Conflict               | Business rule violation (e.g., insufficient stock) |
| 422  | Unprocessable Entity   | Semantic validation error                  |
| 500  | Internal Server Error  | Unexpected server error                    |

---

## Endpoints

### 1. Create Item

Create a new inventory item with initial quantity.

**Endpoint:** `POST /v1/items`

**Request Body:**
```json
{
  "name": "White T-Shirt",
  "initial_quantity": 100
}
```

**Validation Rules:**
- `name`: Required, string, 1-255 characters
- `initial_quantity`: Required, integer, > 0

**Success Response (201 Created):**
```json
{
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "White T-Shirt",
    "total_quantity": 100,
    "created_at": "2026-01-09T14:30:00.000Z",
    "updated_at": "2026-01-09T14:30:00.000Z"
  }
}
```

**Error Responses:**

400 Bad Request - Invalid input:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": {
      "initial_quantity": "Must be greater than 0"
    }
  }
}
```

**Example cURL:**
```bash
curl -X POST http://localhost:3000/v1/items \
  -H "Content-Type: application/json" \
  -d '{
    "name": "White T-Shirt",
    "initial_quantity": 100
  }'
```

---

### 2. Get Item Status

Retrieve item details including availability breakdown.

**Endpoint:** `GET /v1/items/:id`

**Path Parameters:**
- `id`: UUID of the item

**Success Response (200 OK):**
```json
{
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "White T-Shirt",
    "total_quantity": 100,
    "available_quantity": 45,
    "reserved_quantity": 30,
    "confirmed_quantity": 25,
    "created_at": "2026-01-09T14:30:00.000Z",
    "updated_at": "2026-01-09T14:30:00.000Z"
  }
}
```

**Field Explanations:**
- `total_quantity`: Total units of this item (never changes after creation)
- `available_quantity`: Units free to be reserved right now
- `reserved_quantity`: Units currently held in active (pending, unexpired) reservations
- `confirmed_quantity`: Units permanently allocated via confirmed reservations

**Invariant Check:**
```
reserved_quantity + confirmed_quantity ≤ total_quantity
available_quantity = total_quantity - reserved_quantity - confirmed_quantity
```

**Error Responses:**

404 Not Found:
```json
{
  "error": {
    "code": "ITEM_NOT_FOUND",
    "message": "Item with ID 550e8400-e29b-41d4-a716-446655440000 not found"
  }
}
```

**Example cURL:**
```bash
curl http://localhost:3000/v1/items/550e8400-e29b-41d4-a716-446655440000
```

---

### 3. Create Reservation

Create a temporary hold on inventory for a customer.

**Endpoint:** `POST /v1/reservations`

**Request Body:**
```json
{
  "item_id": "550e8400-e29b-41d4-a716-446655440000",
  "customer_id": "customer_123",
  "quantity": 5
}
```

**Validation Rules:**
- `item_id`: Required, valid UUID
- `customer_id`: Required, string, 1-255 characters
- `quantity`: Required, integer, > 0

**Business Rules:**
- Must have sufficient available quantity
- Reservation expires in 10 minutes (configurable)
- Uses pessimistic locking to prevent overselling

**Success Response (201 Created):**
```json
{
  "data": {
    "id": "660e8400-e29b-41d4-a716-446655440000",
    "item_id": "550e8400-e29b-41d4-a716-446655440000",
    "customer_id": "customer_123",
    "quantity": 5,
    "status": "PENDING",
    "expires_at": "2026-01-09T14:40:00.000Z",
    "created_at": "2026-01-09T14:30:00.000Z"
  }
}
```

**Error Responses:**

404 Not Found - Item doesn't exist:
```json
{
  "error": {
    "code": "ITEM_NOT_FOUND",
    "message": "Item with ID 550e8400-e29b-41d4-a716-446655440000 not found"
  }
}
```

409 Conflict - Insufficient quantity:
```json
{
  "error": {
    "code": "INSUFFICIENT_QUANTITY",
    "message": "Cannot reserve 50 units. Only 45 available.",
    "details": {
      "requested": 50,
      "available": 45
    }
  }
}
```

**Example cURL:**
```bash
curl -X POST http://localhost:3000/v1/reservations \
  -H "Content-Type: application/json" \
  -d '{
    "item_id": "550e8400-e29b-41d4-a716-446655440000",
    "customer_id": "customer_123",
    "quantity": 5
  }'
```

**Concurrency Behavior:**
- If 200 concurrent requests try to reserve 1 unit each from an item with 50 units:
  - First 50 succeed (201 Created)
  - Remaining 150 fail (409 Conflict)
- Guaranteed by database row-level locking

---

### 4. Confirm Reservation

Finalize a reservation, permanently reducing available inventory.

**Endpoint:** `POST /v1/reservations/:id/confirm`

**Path Parameters:**
- `id`: UUID of the reservation

**Business Rules:**
- Only PENDING reservations can be confirmed
- Expired reservations cannot be confirmed
- Idempotent: Confirming twice returns success (doesn't deduct twice)

**Success Response (200 OK):**
```json
{
  "data": {
    "id": "660e8400-e29b-41d4-a716-446655440000",
    "item_id": "550e8400-e29b-41d4-a716-446655440000",
    "customer_id": "customer_123",
    "quantity": 5,
    "status": "CONFIRMED",
    "expires_at": "2026-01-09T14:40:00.000Z",
    "created_at": "2026-01-09T14:30:00.000Z",
    "confirmed_at": "2026-01-09T14:35:00.000Z"
  }
}
```

**Error Responses:**

404 Not Found:
```json
{
  "error": {
    "code": "RESERVATION_NOT_FOUND",
    "message": "Reservation with ID 660e8400-e29b-41d4-a716-446655440000 not found"
  }
}
```

409 Conflict - Reservation expired:
```json
{
  "error": {
    "code": "RESERVATION_EXPIRED",
    "message": "Cannot confirm expired reservation",
    "details": {
      "reservation_id": "660e8400-e29b-41d4-a716-446655440000",
      "expired_at": "2026-01-09T14:40:00.000Z"
    }
  }
}
```

409 Conflict - Already cancelled:
```json
{
  "error": {
    "code": "INVALID_STATUS_TRANSITION",
    "message": "Cannot confirm cancelled reservation",
    "details": {
      "current_status": "CANCELLED"
    }
  }
}
```

**Idempotency Example:**

First call:
```
POST /v1/reservations/660e8400-e29b-41d4-a716-446655440000/confirm
→ 200 OK (reservation confirmed)
```

Second call (retry):
```
POST /v1/reservations/660e8400-e29b-41d4-a716-446655440000/confirm
→ 200 OK (already confirmed, no side effects)
```

**Example cURL:**
```bash
curl -X POST http://localhost:3000/v1/reservations/660e8400-e29b-41d4-a716-446655440000/confirm
```

---

### 5. Cancel Reservation

Cancel a pending reservation, releasing quantity back to availability.

**Endpoint:** `POST /v1/reservations/:id/cancel`

**Path Parameters:**
- `id`: UUID of the reservation

**Business Rules:**
- Only PENDING reservations can be cancelled
- Cannot cancel confirmed reservations
- Idempotent: Cancelling twice returns success

**Success Response (200 OK):**
```json
{
  "data": {
    "id": "660e8400-e29b-41d4-a716-446655440000",
    "item_id": "550e8400-e29b-41d4-a716-446655440000",
    "customer_id": "customer_123",
    "quantity": 5,
    "status": "CANCELLED",
    "expires_at": "2026-01-09T14:40:00.000Z",
    "created_at": "2026-01-09T14:30:00.000Z",
    "cancelled_at": "2026-01-09T14:33:00.000Z"
  }
}
```

**Error Responses:**

404 Not Found:
```json
{
  "error": {
    "code": "RESERVATION_NOT_FOUND",
    "message": "Reservation with ID 660e8400-e29b-41d4-a716-446655440000 not found"
  }
}
```

409 Conflict - Already confirmed:
```json
{
  "error": {
    "code": "INVALID_STATUS_TRANSITION",
    "message": "Cannot cancel confirmed reservation",
    "details": {
      "current_status": "CONFIRMED"
    }
  }
}
```

**Idempotency Example:**

First call:
```
POST /v1/reservations/660e8400-e29b-41d4-a716-446655440000/cancel
→ 200 OK (reservation cancelled)
```

Second call (retry):
```
POST /v1/reservations/660e8400-e29b-41d4-a716-446655440000/cancel
→ 200 OK (already cancelled, no side effects)
```

**Example cURL:**
```bash
curl -X POST http://localhost:3000/v1/reservations/660e8400-e29b-41d4-a716-446655440000/cancel
```

---

### 6. Expire Reservations

Batch operation to mark expired pending reservations, releasing their quantity.

**Endpoint:** `POST /v1/maintenance/expire-reservations`

**Request Body:** None

**Business Rules:**
- Finds all reservations where status = PENDING AND expires_at <= NOW()
- Marks them as EXPIRED
- Releases their quantity back to availability
- Safe to run concurrently (each reservation expired exactly once)

**Success Response (200 OK):**
```json
{
  "data": {
    "expired_count": 15,
    "expired_reservation_ids": [
      "660e8400-e29b-41d4-a716-446655440001",
      "660e8400-e29b-41d4-a716-446655440002",
      "..."
    ]
  },
  "message": "Successfully expired 15 reservations"
}
```

**Success Response (No Expired Reservations):**
```json
{
  "data": {
    "expired_count": 0,
    "expired_reservation_ids": []
  },
  "message": "No reservations to expire"
}
```

**Example cURL:**
```bash
curl -X POST http://localhost:3000/v1/maintenance/expire-reservations
```

**Use Cases:**
1. Manual trigger in demo/testing
2. Scheduled cron job (future enhancement)
3. Health check endpoint

**Concurrency Safety:**
- Multiple calls running simultaneously: Each reservation expired exactly once
- No double-release of quantity
- Uses atomic SQL UPDATE with WHERE clause

---

## Additional Endpoints (Optional)

### 7. Get Reservation by ID

**Endpoint:** `GET /v1/reservations/:id`

Get details of a specific reservation.

**Success Response (200 OK):**
```json
{
  "data": {
    "id": "660e8400-e29b-41d4-a716-446655440000",
    "item_id": "550e8400-e29b-41d4-a716-446655440000",
    "customer_id": "customer_123",
    "quantity": 5,
    "status": "PENDING",
    "expires_at": "2026-01-09T14:40:00.000Z",
    "created_at": "2026-01-09T14:30:00.000Z"
  }
}
```

### 8. List Items

**Endpoint:** `GET /v1/items`

Get all items with availability summary.

**Query Parameters:**
- `limit`: Max results (default: 50)
- `offset`: Pagination offset (default: 0)

**Success Response (200 OK):**
```json
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "White T-Shirt",
      "total_quantity": 100,
      "available_quantity": 45
    },
    {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "name": "Blue Jeans",
      "total_quantity": 50,
      "available_quantity": 30
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 2
  }
}
```

### 9. List Reservations for Customer

**Endpoint:** `GET /v1/reservations?customer_id={customer_id}`

Get all reservations for a customer.

**Query Parameters:**
- `customer_id`: Required, customer identifier
- `status`: Optional, filter by status (PENDING, CONFIRMED, CANCELLED, EXPIRED)

---

## Swagger/OpenAPI Documentation

### Accessing Documentation

**Swagger UI:** `http://localhost:3000/docs`
**OpenAPI JSON:** `http://localhost:3000/openapi.json`

### Features
- Interactive API testing
- Request/response examples
- Schema definitions
- Authentication details (if applicable)

---

## Rate Limiting

**Not implemented in this assignment.**

In production, you would typically implement:
- Per-IP rate limiting (e.g., 100 requests/minute)
- Per-customer rate limiting (e.g., 10 reservations/minute)
- Returns HTTP 429 Too Many Requests

---

## CORS Configuration

**Development:** All origins allowed
**Production:** Configure allowed origins in environment variables

```javascript
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*'
}));
```

---

## Request/Response Examples

### Scenario: Complete Reservation Flow

#### 1. Create Item
```bash
curl -X POST http://localhost:3000/v1/items \
  -H "Content-Type: application/json" \
  -d '{"name": "Gaming Laptop", "initial_quantity": 10}'

# Response:
{
  "data": {
    "id": "a1b2c3d4-...",
    "name": "Gaming Laptop",
    "total_quantity": 10
  }
}
```

#### 2. Check Availability
```bash
curl http://localhost:3000/v1/items/a1b2c3d4-...

# Response:
{
  "data": {
    "total_quantity": 10,
    "available_quantity": 10,
    "reserved_quantity": 0,
    "confirmed_quantity": 0
  }
}
```

#### 3. Create Reservation
```bash
curl -X POST http://localhost:3000/v1/reservations \
  -H "Content-Type: application/json" \
  -d '{
    "item_id": "a1b2c3d4-...",
    "customer_id": "alice@example.com",
    "quantity": 2
  }'

# Response:
{
  "data": {
    "id": "e5f6g7h8-...",
    "status": "PENDING",
    "expires_at": "2026-01-09T14:40:00Z"
  }
}
```

#### 4. Check Availability Again
```bash
curl http://localhost:3000/v1/items/a1b2c3d4-...

# Response:
{
  "data": {
    "total_quantity": 10,
    "available_quantity": 8,    # Decreased
    "reserved_quantity": 2,     # Increased
    "confirmed_quantity": 0
  }
}
```

#### 5. Confirm Reservation
```bash
curl -X POST http://localhost:3000/v1/reservations/e5f6g7h8-.../confirm

# Response:
{
  "data": {
    "id": "e5f6g7h8-...",
    "status": "CONFIRMED",
    "confirmed_at": "2026-01-09T14:35:00Z"
  }
}
```

#### 6. Final Availability Check
```bash
curl http://localhost:3000/v1/items/a1b2c3d4-...

# Response:
{
  "data": {
    "total_quantity": 10,
    "available_quantity": 8,    # Stays same (confirmed doesn't add back)
    "reserved_quantity": 0,     # Decreased (no longer pending)
    "confirmed_quantity": 2     # Increased
  }
}
```

---

## Testing Endpoints

### Health Check
```bash
curl http://localhost:3000/health

# Response:
{
  "status": "healthy",
  "timestamp": "2026-01-09T14:30:00.000Z",
  "database": "connected"
}
```

### API Version
```bash
curl http://localhost:3000/v1

# Response:
{
  "version": "1.0.0",
  "api": "Inventory Reservation API"
}
```

---

## Error Handling Best Practices

### 1. Consistent Error Format
All errors follow the same structure for easy client parsing.

### 2. Meaningful Error Codes
```typescript
enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  ITEM_NOT_FOUND = 'ITEM_NOT_FOUND',
  RESERVATION_NOT_FOUND = 'RESERVATION_NOT_FOUND',
  INSUFFICIENT_QUANTITY = 'INSUFFICIENT_QUANTITY',
  RESERVATION_EXPIRED = 'RESERVATION_EXPIRED',
  INVALID_STATUS_TRANSITION = 'INVALID_STATUS_TRANSITION',
  DATABASE_ERROR = 'DATABASE_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR'
}
```

### 3. Client Retry Logic
- 409 Conflict (insufficient quantity): Don't retry
- 500 Internal Server Error: Retry with exponential backoff
- 400 Bad Request: Fix input, then retry

---

## Performance Metrics

### Expected Response Times (p95)
- GET /v1/items/:id: < 50ms
- POST /v1/items: < 100ms
- POST /v1/reservations: < 200ms (due to locking)
- POST /v1/reservations/:id/confirm: < 100ms
- POST /v1/maintenance/expire-reservations: < 500ms (batch operation)

### Concurrency Performance
- 200 concurrent requests to reserve 1 unit each
- Expected completion time: < 5 seconds
- Zero overselling incidents

---

## Security Headers

All responses include:
```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Content-Security-Policy: default-src 'self'
```
