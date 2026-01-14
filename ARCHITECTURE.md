# Architecture Overview

## System Design

This is an **Inventory Reservation API** built with Express.js, TypeScript, PostgreSQL (via Supabase), and deployed on Vercel.

### Core Objective
Manage inventory with temporary reservations while **preventing overselling under any level of concurrency**.

---

## Key Invariant (Must Never Be Violated)

```
confirmed_quantity + active_pending_unexpired_quantity ≤ total_quantity
```

This invariant must hold true at all times, even under:
- Concurrent reservation requests
- Race conditions between confirm/cancel/expire operations
- Horizontal scaling scenarios

---

## Architecture Layers

```
┌─────────────────────────────────────┐
│     Express.js API Endpoints        │
│   (Routes + Input Validation)       │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│      Business Logic Layer           │
│  (Service layer with transaction    │
│   management and concurrency logic) │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│    Database Access Layer (DAL)      │
│  (Repository pattern with Supabase) │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│   PostgreSQL (Supabase)             │
│  - Row-level locking                │
│  - Transactions (SERIALIZABLE)      │
│  - Constraints & Indexes            │
└─────────────────────────────────────┘
```

---

## Concurrency Strategy

### Problem
Multiple clients may attempt to reserve the same inventory simultaneously, leading to potential overselling.

### Solution: Database-Driven Consistency

We use **PostgreSQL transactions with row-level locking** to ensure atomicity and isolation:

#### 1. Pessimistic Locking with `SELECT ... FOR UPDATE`
When creating a reservation:
```sql
BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;

-- Lock the item row
SELECT total_quantity
FROM items
WHERE id = $1
FOR UPDATE;

-- Calculate available quantity
SELECT COALESCE(SUM(quantity), 0)
FROM reservations
WHERE item_id = $1
  AND status = 'PENDING'
  AND expires_at > NOW();

-- Verify availability
IF (total_quantity - reserved_quantity >= requested_quantity) THEN
  -- Create reservation
  INSERT INTO reservations (...) VALUES (...);
ELSE
  -- Raise insufficient availability error
END IF;

COMMIT;
```

**Why this works:**
- `FOR UPDATE` locks the item row, preventing concurrent modifications
- Other transactions attempting to reserve the same item will wait
- Calculations happen within the transaction boundary
- SERIALIZABLE isolation level prevents phantom reads

#### 2. Idempotency Through Status Tracking
All state transitions are idempotent:

**Confirm:**
- Only transitions `PENDING` → `CONFIRMED`
- Update uses: `WHERE id = $1 AND status = 'PENDING' AND expires_at > NOW()`
- If already confirmed, returns success with current state
- If expired, returns error without modifying data

**Cancel:**
- Only transitions `PENDING` → `CANCELLED`
- Update uses: `WHERE id = $1 AND status = 'PENDING'`
- If already cancelled/confirmed, returns success with current state

#### 3. Atomic Status Transitions
```sql
UPDATE reservations
SET status = 'CONFIRMED', confirmed_at = NOW()
WHERE id = $1
  AND status = 'PENDING'
  AND expires_at > NOW()
RETURNING *;
```

This single statement ensures:
- Only pending reservations can be confirmed
- Only non-expired reservations can be confirmed
- Returns affected rows (0 if conditions not met)

#### 4. Constraint-Based Protection
Database constraints enforce business rules at the lowest level:

```sql
-- Positive quantities only
CHECK (total_quantity > 0)
CHECK (quantity > 0)

-- Valid status transitions
CHECK (status IN ('PENDING', 'CONFIRMED', 'CANCELLED', 'EXPIRED'))

-- Expiration must be in future at creation
CHECK (expires_at > created_at)
```

---

## Race Condition Handling

### Race 1: Multiple Concurrent Reservations
**Scenario:** 200 requests try to reserve 1 unit each, but only 50 units available

**Protection:**
- Row-level lock on items table during availability check
- Atomic calculation: `total_quantity - SUM(pending_reservations)`
- First 50 succeed, remaining 150 fail with HTTP 409

### Race 2: Confirm vs Expire
**Scenario:** Confirm endpoint called at same time as expire maintenance job

**Protection:**
- Both use atomic WHERE clauses
- Confirm: `WHERE status = 'PENDING' AND expires_at > NOW()`
- Expire: `WHERE status = 'PENDING' AND expires_at <= NOW()`
- Conditions are mutually exclusive, only one can succeed

### Race 3: Cancel vs Confirm
**Scenario:** Customer cancels while payment processor confirms

**Protection:**
- Both use optimistic locking with status check
- Confirm: `WHERE status = 'PENDING'`
- Cancel: `WHERE status = 'PENDING'`
- First operation wins, second returns error or success based on final state
- Idempotency ensures safe retries

### Race 4: Multiple Concurrent Expire Calls
**Scenario:** Cron job or multiple servers call expire endpoint simultaneously

**Protection:**
- Atomic batch update: `UPDATE ... WHERE status = 'PENDING' AND expires_at <= NOW()`
- PostgreSQL handles row-level locking automatically
- Each row can only be expired once

---

## Horizontal Scalability

### Why No In-Memory State?
- Deployed on Vercel (serverless, multiple instances)
- Cannot rely on application-level locks or caches
- Must be stateless

### Database as Source of Truth
All consistency guarantees come from PostgreSQL:
- ACID transactions
- Row-level locks (automatically managed by PostgreSQL)
- Serializable isolation when needed
- Constraints enforced at DB level

---

## Error Handling Strategy

### HTTP Status Codes
- `200 OK` - Successful operation
- `201 Created` - Resource created
- `400 Bad Request` - Invalid input (validation error)
- `404 Not Found` - Resource doesn't exist
- `409 Conflict` - Business rule violation (insufficient quantity, invalid state transition)
- `422 Unprocessable Entity` - Semantic validation error
- `500 Internal Server Error` - Unexpected error

### Consistent Error Response Format
```json
{
  "error": {
    "code": "INSUFFICIENT_QUANTITY",
    "message": "Cannot reserve 10 units. Only 5 available.",
    "details": {
      "requested": 10,
      "available": 5
    }
  }
}
```

---

## Assumptions

1. **Reservation Expiry:** 10 minutes from creation (configurable)
2. **Customer Identification:** Simple string customer_id (no auth required)
3. **Inventory Updates:** Items are created with initial quantity, no restock endpoint needed
4. **Expiration Mechanism:** Manual trigger via POST endpoint (no automatic background job in this scope)
5. **Timezone:** All timestamps in UTC
6. **ID Format:** UUIDs for items and reservations
7. **Quantity Type:** Integer only (no fractional units)

---

## Performance Considerations

### Indexes
- `items(id)` - Primary key, automatic
- `reservations(id)` - Primary key, automatic
- `reservations(item_id, status, expires_at)` - Composite for availability queries
- `reservations(status, expires_at)` - For expire maintenance job

### Query Optimization
- Availability calculation uses indexed columns
- Expire batch operations use index on `(status, expires_at)`
- Foreign keys create implicit indexes

### Connection Pooling
- Supabase client handles connection pooling
- Vercel serverless functions reuse connections when possible

---

## Deployment Architecture

```
┌──────────────┐
│   Client     │
└──────┬───────┘
       │
       │ HTTPS
       ▼
┌──────────────────┐
│  Vercel Edge     │
│  (Load Balancer) │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Serverless       │
│ Functions        │
│ (Multiple        │
│  Instances)      │
└──────┬───────────┘
       │
       │ Connection Pool
       ▼
┌──────────────────┐
│  Supabase        │
│  (PostgreSQL)    │
└──────────────────┘
```

---

## Testing Strategy

### Unit Tests
- Validation logic
- Business logic calculations
- Error response formatting

### Integration Tests
- Each endpoint with valid/invalid inputs
- Database state verification

### Concurrency Tests (Critical)
Command: `npm run test:concurrency`

**Test 1: Overselling Prevention**
- Create item with quantity 50
- Fire 200 concurrent reservation requests (1 unit each)
- Assert: 50 successes, 150 failures (HTTP 409)
- Verify invariant: `confirmed + pending ≤ total`

**Test 2: Confirm vs Expire Race**
- Create reservations near expiry
- Simultaneously call confirm and expire
- Verify only one succeeds per reservation

**Test 3: Cancel vs Confirm Race**
- Create reservations
- Simultaneously call cancel and confirm
- Verify only one succeeds per reservation

**Test 4: Multiple Expire Calls**
- Create expired reservations
- Call expire endpoint 10 times concurrently
- Verify each reservation expired exactly once

---

## Monitoring & Observability

### Key Metrics
- Reservation success rate
- Availability calculation time
- Transaction lock wait times
- Expiration job execution time

### Logging
- All state transitions (PENDING → CONFIRMED/CANCELLED/EXPIRED)
- Insufficient quantity events (for demand analysis)
- Transaction rollbacks
- Validation errors

---

## Future Enhancements (Out of Scope)

1. **Automatic Expiration:** Background job (cron) to expire reservations
2. **Inventory Restocking:** Endpoint to increase item quantities
3. **Reservation Extension:** Ability to extend expiry time
4. **Customer Management:** Authentication and customer profiles
5. **Partial Confirmation:** Confirm fewer units than reserved
6. **Reservation History:** Audit log of all state changes
7. **Rate Limiting:** Per-customer or per-IP
8. **Caching:** Redis for item availability queries
9. **Event System:** Pub/sub for reservation state changes
10. **Analytics:** Dashboard for inventory insights
