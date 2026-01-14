# Database Schema Design

## Overview

The database consists of two main tables:
1. **items** - Products available for purchase
2. **reservations** - Temporary holds on inventory

---

## Entity Relationship Diagram

```
┌─────────────────────────────┐
│          items              │
├─────────────────────────────┤
│ id (PK, UUID)               │
│ name (VARCHAR)              │
│ total_quantity (INTEGER)    │
│ created_at (TIMESTAMP)      │
│ updated_at (TIMESTAMP)      │
└──────────────┬──────────────┘
               │
               │ 1:N
               │
┌──────────────▼──────────────┐
│      reservations           │
├─────────────────────────────┤
│ id (PK, UUID)               │
│ item_id (FK, UUID)          │
│ customer_id (VARCHAR)       │
│ quantity (INTEGER)          │
│ status (ENUM)               │
│ expires_at (TIMESTAMP)      │
│ created_at (TIMESTAMP)      │
│ confirmed_at (TIMESTAMP?)   │
│ cancelled_at (TIMESTAMP?)   │
│ expired_at (TIMESTAMP?)     │
└─────────────────────────────┘
```

---

## Table: items

Stores product inventory information.

### Schema

| Column         | Type         | Constraints                  | Description                           |
|----------------|--------------|------------------------------|---------------------------------------|
| id             | UUID         | PRIMARY KEY, DEFAULT uuid_generate_v4() | Unique identifier                     |
| name           | VARCHAR(255) | NOT NULL                     | Product name (e.g., "White T-Shirt")  |
| total_quantity | INTEGER      | NOT NULL, CHECK (> 0)        | Total units of this item              |
| created_at     | TIMESTAMPTZ  | NOT NULL, DEFAULT NOW()      | When item was created                 |
| updated_at     | TIMESTAMPTZ  | NOT NULL, DEFAULT NOW()      | Last modification time                |

### Constraints

```sql
-- Primary key
CONSTRAINT items_pkey PRIMARY KEY (id)

-- Positive quantity only
CONSTRAINT items_total_quantity_positive CHECK (total_quantity > 0)
```

### Indexes

```sql
-- Primary key index (automatic)
CREATE INDEX idx_items_id ON items(id);
```

### Sample Data

```sql
INSERT INTO items (id, name, total_quantity) VALUES
('550e8400-e29b-41d4-a716-446655440000', 'White T-Shirt', 100),
('550e8400-e29b-41d4-a716-446655440001', 'Blue Jeans', 50);
```

---

## Table: reservations

Stores temporary holds on inventory with expiration and status tracking.

### Schema

| Column        | Type        | Constraints                        | Description                                  |
|---------------|-------------|------------------------------------|----------------------------------------------|
| id            | UUID        | PRIMARY KEY, DEFAULT uuid_generate_v4() | Unique identifier                            |
| item_id       | UUID        | NOT NULL, REFERENCES items(id)     | Item being reserved                          |
| customer_id   | VARCHAR(255)| NOT NULL                           | Customer identifier                          |
| quantity      | INTEGER     | NOT NULL, CHECK (> 0)              | Number of units reserved                     |
| status        | VARCHAR(20) | NOT NULL, CHECK (IN ...)           | PENDING, CONFIRMED, CANCELLED, EXPIRED       |
| expires_at    | TIMESTAMPTZ | NOT NULL                           | When reservation expires (if PENDING)        |
| created_at    | TIMESTAMPTZ | NOT NULL, DEFAULT NOW()            | When reservation was created                 |
| confirmed_at  | TIMESTAMPTZ | NULL                               | When reservation was confirmed               |
| cancelled_at  | TIMESTAMPTZ | NULL                               | When reservation was cancelled               |
| expired_at    | TIMESTAMPTZ | NULL                               | When reservation was expired                 |

### Constraints

```sql
-- Primary key
CONSTRAINT reservations_pkey PRIMARY KEY (id)

-- Foreign key to items
CONSTRAINT reservations_item_id_fkey
  FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE

-- Positive quantity only
CONSTRAINT reservations_quantity_positive CHECK (quantity > 0)

-- Valid status values
CONSTRAINT reservations_status_check
  CHECK (status IN ('PENDING', 'CONFIRMED', 'CANCELLED', 'EXPIRED'))

-- Expiration must be after creation
CONSTRAINT reservations_expires_after_creation
  CHECK (expires_at > created_at)
```

### Indexes

```sql
-- Primary key index (automatic)
CREATE INDEX idx_reservations_id ON reservations(id);

-- Foreign key index (for joins with items)
CREATE INDEX idx_reservations_item_id ON reservations(item_id);

-- Composite index for availability queries
-- Used in: "Get all active reservations for an item"
CREATE INDEX idx_reservations_item_status_expires
  ON reservations(item_id, status, expires_at);

-- Index for expire maintenance job
-- Used in: "Find all expired pending reservations"
CREATE INDEX idx_reservations_status_expires
  ON reservations(status, expires_at);

-- Optional: Customer lookup index
CREATE INDEX idx_reservations_customer_id ON reservations(customer_id);
```

### Status State Machine

```
         CREATE
            │
            ▼
       ┌─────────┐
       │ PENDING │◄──────┐
       └────┬────┘       │
            │            │
       ┌────┼────────┐   │
       │    │        │   │
       │    │        │   │
   CONFIRM CANCEL  EXPIRE│
       │    │        │   │
       ▼    ▼        ▼   │
  ┌─────┐ ┌────┐  ┌────┐│
  │CONF'│ │CAN'│  │EXP'││
  │IRMED│ │CELL│  │IRED││
  └─────┘ └┬───┘  └────┘│
           │             │
           └─────────────┘
        (Cannot cancel
         confirmed reservation)
```

### Status Transition Rules

| From      | To        | Condition                                    | Effect on Availability |
|-----------|-----------|----------------------------------------------|------------------------|
| PENDING   | CONFIRMED | Before expires_at                            | Permanently reduces    |
| PENDING   | CANCELLED | Any time                                     | Releases quantity      |
| PENDING   | EXPIRED   | After expires_at                             | Releases quantity      |
| CONFIRMED | -         | Terminal state (no transitions)              | -                      |
| CANCELLED | -         | Terminal state (no transitions)              | -                      |
| EXPIRED   | -         | Terminal state (no transitions)              | -                      |

### Sample Data

```sql
INSERT INTO reservations (
  id,
  item_id,
  customer_id,
  quantity,
  status,
  expires_at,
  created_at
) VALUES (
  '660e8400-e29b-41d4-a716-446655440000',
  '550e8400-e29b-41d4-a716-446655440000',
  'customer_123',
  5,
  'PENDING',
  NOW() + INTERVAL '10 minutes',
  NOW()
);
```

---

## Availability Calculation

### Formula

```
available_quantity = total_quantity - active_reserved_quantity
```

Where:
- `total_quantity` = items.total_quantity
- `active_reserved_quantity` = SUM of quantities from reservations WHERE:
  - status = 'PENDING' AND expires_at > NOW()

### SQL Query

```sql
SELECT
  i.id,
  i.name,
  i.total_quantity,
  COALESCE(SUM(r.quantity) FILTER (
    WHERE r.status = 'PENDING'
      AND r.expires_at > NOW()
  ), 0) AS reserved_quantity,
  i.total_quantity - COALESCE(SUM(r.quantity) FILTER (
    WHERE r.status = 'PENDING'
      AND r.expires_at > NOW()
  ), 0) AS available_quantity,
  COALESCE(SUM(r.quantity) FILTER (
    WHERE r.status = 'CONFIRMED'
  ), 0) AS confirmed_quantity
FROM items i
LEFT JOIN reservations r ON r.item_id = i.id
WHERE i.id = $1
GROUP BY i.id, i.name, i.total_quantity;
```

---

## Concurrency-Safe Operations

### 1. Create Reservation (with Lock)

```sql
BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;

-- Lock the item row
SELECT total_quantity
FROM items
WHERE id = $1
FOR UPDATE;

-- Calculate reserved quantity
SELECT COALESCE(SUM(quantity), 0) AS reserved
FROM reservations
WHERE item_id = $1
  AND status = 'PENDING'
  AND expires_at > NOW();

-- Check availability
-- (done in application logic)

-- Insert reservation
INSERT INTO reservations (
  item_id,
  customer_id,
  quantity,
  status,
  expires_at
)
VALUES ($1, $2, $3, 'PENDING', NOW() + INTERVAL '10 minutes')
RETURNING *;

COMMIT;
```

**Key Points:**
- `FOR UPDATE` locks the item row
- Other concurrent reservations will wait
- Prevents race conditions on availability calculation

### 2. Confirm Reservation (Idempotent)

```sql
UPDATE reservations
SET
  status = 'CONFIRMED',
  confirmed_at = NOW()
WHERE id = $1
  AND status = 'PENDING'
  AND expires_at > NOW()
RETURNING *;
```

**Key Points:**
- Only updates if currently PENDING and not expired
- Returns 0 rows if already confirmed (idempotent)
- Atomic operation, no explicit transaction needed

### 3. Cancel Reservation (Idempotent)

```sql
UPDATE reservations
SET
  status = 'CANCELLED',
  cancelled_at = NOW()
WHERE id = $1
  AND status = 'PENDING'
RETURNING *;
```

**Key Points:**
- Only updates if currently PENDING
- Cannot cancel confirmed reservations
- Returns 0 rows if already cancelled

### 4. Expire Reservations (Batch)

```sql
UPDATE reservations
SET
  status = 'EXPIRED',
  expired_at = NOW()
WHERE status = 'PENDING'
  AND expires_at <= NOW()
RETURNING id;
```

**Key Points:**
- Batch operation on all expired reservations
- Safe to run concurrently (each row updated once)
- Returns IDs of expired reservations for logging

---

## Migration Strategy

### Initial Setup

The database will be set up using a single SQL migration file: `migration.sql`

This file will:
1. Enable UUID extension
2. Create items table with constraints
3. Create reservations table with constraints and foreign keys
4. Create all indexes
5. Add sample data (optional, for testing)

### Running the Migration

```bash
# In Supabase SQL Editor:
# 1. Copy contents of migration.sql
# 2. Paste into SQL Editor
# 3. Click "Run"
```

### Rollback Strategy

To rollback:
```sql
DROP TABLE IF EXISTS reservations CASCADE;
DROP TABLE IF EXISTS items CASCADE;
DROP EXTENSION IF EXISTS "uuid-ossp" CASCADE;
```

---

## Data Integrity Rules

### Database-Level Protection

1. **No Negative Quantities**
   - `CHECK (total_quantity > 0)` on items
   - `CHECK (quantity > 0)` on reservations

2. **Valid Status Values**
   - `CHECK (status IN ('PENDING', 'CONFIRMED', 'CANCELLED', 'EXPIRED'))`

3. **Referential Integrity**
   - Foreign key from reservations to items
   - ON DELETE CASCADE (if item deleted, reservations deleted)

4. **Time Consistency**
   - `CHECK (expires_at > created_at)`

### Application-Level Validation

1. **Overselling Prevention**
   - Check: `available_quantity >= requested_quantity`
   - Protected by: Transaction + row lock

2. **State Transition Validation**
   - Only PENDING can transition to CONFIRMED/CANCELLED/EXPIRED
   - Cannot confirm expired reservations

3. **Idempotency**
   - Multiple confirms/cancels return success without side effects

---

## Performance Characteristics

### Expected Query Patterns

| Query                                  | Frequency | Index Used                          | Performance |
|----------------------------------------|-----------|-------------------------------------|-------------|
| Get item by ID                         | High      | PK (items.id)                       | O(1)        |
| Calculate availability for item        | High      | idx_reservations_item_status_expires| O(log n)    |
| Create reservation                     | High      | PK + FK indexes                     | O(log n)    |
| Confirm/cancel reservation by ID       | Medium    | PK (reservations.id)                | O(1)        |
| Expire old reservations (batch)        | Low       | idx_reservations_status_expires     | O(n)        |
| Get customer's reservations            | Low       | idx_reservations_customer_id        | O(log n)    |

### Scalability Considerations

1. **Write Contention**
   - High-demand items may cause lock contention
   - Mitigation: Fast transactions, minimal lock duration

2. **Index Maintenance**
   - Each write updates 3-4 indexes
   - Trade-off: Write speed for read performance

3. **Storage Growth**
   - Reservations table grows indefinitely
   - Future: Archive old reservations (CONFIRMED/CANCELLED/EXPIRED)

---

## Testing Data Setup

### Minimal Test Data

```sql
-- Create test items
INSERT INTO items (name, total_quantity) VALUES
('Test Item - Small Stock', 5),
('Test Item - Large Stock', 1000),
('Test Item - Single Unit', 1);

-- Create test reservations
INSERT INTO reservations (item_id, customer_id, quantity, status, expires_at)
SELECT
  (SELECT id FROM items WHERE name = 'Test Item - Small Stock'),
  'test_customer_' || generate_series,
  1,
  'PENDING',
  NOW() + INTERVAL '10 minutes'
FROM generate_series(1, 3);
```

### Concurrency Test Setup

```sql
-- Create item for concurrency testing
INSERT INTO items (id, name, total_quantity) VALUES
('ffffffff-ffff-ffff-ffff-ffffffffffff', 'Concurrency Test Item', 50);
```

---

## Monitoring Queries

### Check System Health

```sql
-- Count reservations by status
SELECT status, COUNT(*)
FROM reservations
GROUP BY status;

-- Find items with low availability
SELECT
  i.name,
  i.total_quantity,
  COALESCE(SUM(r.quantity), 0) AS reserved,
  i.total_quantity - COALESCE(SUM(r.quantity), 0) AS available
FROM items i
LEFT JOIN reservations r ON r.item_id = i.id
  AND r.status = 'PENDING'
  AND r.expires_at > NOW()
GROUP BY i.id, i.name, i.total_quantity
HAVING i.total_quantity - COALESCE(SUM(r.quantity), 0) < 10;

-- Find reservations about to expire
SELECT id, customer_id, quantity, expires_at
FROM reservations
WHERE status = 'PENDING'
  AND expires_at BETWEEN NOW() AND NOW() + INTERVAL '2 minutes'
ORDER BY expires_at;
```

---

## Security Considerations

1. **SQL Injection Prevention**
   - All queries use parameterized statements
   - Never concatenate user input into SQL

2. **UUID Usage**
   - UUIDs prevent enumeration attacks
   - Harder to guess valid IDs

3. **Audit Trail**
   - All state changes timestamped
   - Cannot modify historical data

4. **Soft Deletes**
   - Reservations never deleted (status-based archival)
   - Maintains data integrity for auditing
