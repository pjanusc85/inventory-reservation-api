# Inventory Reservation API

A backend API for managing inventory with temporary reservations and strong concurrency guarantees.

---

## Quick Links

- **Deployed API:** https://inventory-reservation-api-eosin.vercel.app
- **Swagger Documentation:** https://inventory-reservation-api-eosin.vercel.app/docs
- **OpenAPI JSON:** https://inventory-reservation-api-eosin.vercel.app/openapi.json
- **Demo Video:** https://drive.google.com/drive/folders/1fyh85Fdkxhk8zC406NfUVH2TYJksXA8Y?usp=sharing
- **GitHub Repository:** https://github.com/pjanusc85/inventory-reservation-api

---

## Table of Contents

1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Tech Stack](#tech-stack)
4. [Setup Instructions](#setup-instructions)
5. [Database Setup](#database-setup)
6. [Running Locally](#running-locally)
7. [API Endpoints](#api-endpoints)
8. [Concurrency Guarantees](#concurrency-guarantees)
9. [Testing](#testing)
10. [Deployment](#deployment)
11. [Known Limitations](#known-limitations)
12. [Design Decisions](#design-decisions)

---

## Overview

This API implements an inventory reservation system for a fictitious store, supporting:

- **Temporary Reservations:** Hold inventory for customers with automatic expiration
- **Strong Consistency:** Prevent overselling under any level of concurrency
- **Idempotent Operations:** Safe retry behavior for confirm/cancel operations
- **Horizontal Scalability:** Database-driven consistency (no in-memory state)

### Core Invariant

The system maintains this invariant at all times:

```
confirmed_quantity + active_pending_unexpired_quantity ≤ total_quantity
```

This is enforced through:
- PostgreSQL transactions with SERIALIZABLE isolation
- Row-level locking (`SELECT ... FOR UPDATE`)
- Atomic status transitions
- Database constraints

---

## System Architecture

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│  Express.js API │
│   (TypeScript)  │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│  Business Logic │
│  (Transactions) │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│   PostgreSQL    │
│   (Supabase)    │
└─────────────────┘
```

**Key Design Principles:**
1. **Stateless API:** No in-memory locks or caches
2. **Database as Source of Truth:** All consistency guarantees from PostgreSQL
3. **Pessimistic Locking:** Row-level locks prevent race conditions
4. **Idempotency:** Safe to retry any operation

For detailed architecture information, see [ARCHITECTURE.md](./ARCHITECTURE.md).

---

## Tech Stack

- **Runtime:** Node.js (v18+)
- **Framework:** Express.js with TypeScript
- **Database:** PostgreSQL via Supabase
- **Deployment:** Vercel (serverless functions)
- **API Documentation:** Swagger/OpenAPI (swagger-ui-express, swagger-jsdoc)
- **Validation:** Zod
- **Testing:** Jest + Supertest

---

## Setup Instructions

### Prerequisites

- Node.js v18 or higher
- npm or yarn
- Supabase account (free tier is sufficient)
- Vercel account (for deployment)

### 1. Clone the Repository

```bash
git clone <repository-url>
cd backend-takehome-exercise
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Variables

Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

Edit `.env` with your Supabase credentials:

```env
# Supabase Configuration
# Note: Supports both legacy (JWT) and new (sb_publishable_/sb_secret_) key formats
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key  # or sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key  # or sb_secret_...

# Server Configuration
PORT=3000
NODE_ENV=development

# Reservation Configuration
RESERVATION_EXPIRY_MINUTES=10
```

**How to get Supabase credentials:**
1. Go to [https://supabase.com](https://supabase.com)
2. Create a new project
3. Navigate to Settings > API
4. Copy the URL and keys (both legacy JWT and new `sb_publishable_`/`sb_secret_` formats are supported)

---

## Database Setup

### 1. Access Supabase SQL Editor

1. Log in to your Supabase dashboard
2. Select your project
3. Go to **SQL Editor** in the left sidebar
4. Click **New Query**

### 2. Run Migration

Copy the contents of `migration.sql` and paste into the SQL Editor, then click **Run**.

The migration will:
- Enable UUID extension
- Create `items` table with constraints
- Create `reservations` table with constraints and foreign keys
- Create indexes for optimal query performance
- **Create `create_reservation_atomic()` function** for row-level locking (prevents overselling)

### 3. Verify Tables

Run this query to verify:

```sql
-- Check tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public';

-- Should return: items, reservations
```

### Schema Details

See [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) for complete schema documentation.

**Tables:**
- `items`: Product inventory
  - Columns: id, name, total_quantity, created_at, updated_at
  - Constraints: Positive quantity, UUID primary key

- `reservations`: Temporary holds on inventory
  - Columns: id, item_id, customer_id, quantity, status, expires_at, created_at, confirmed_at, cancelled_at, expired_at
  - Constraints: Foreign key to items, positive quantity, valid status values
  - Indexes: Composite indexes on (item_id, status, expires_at) for fast availability queries

---

## Running Locally

### Development Mode (with auto-reload)

```bash
npm run dev
```

The API will start on `http://localhost:3000`.

### Production Build

```bash
npm run build
npm start
```

### Verify Server is Running

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2026-01-09T14:30:00.000Z",
  "database": "connected"
}
```

---

## API Endpoints

### Base URL (Local)
`http://localhost:3000/v1`

### Endpoints Summary

| Method | Endpoint                                  | Description                      |
|--------|-------------------------------------------|----------------------------------|
| POST   | `/v1/items`                               | Create new item                  |
| GET    | `/v1/items/:id`                           | Get item status with availability|
| POST   | `/v1/reservations`                        | Create reservation (temporary hold)|
| POST   | `/v1/reservations/:id/confirm`            | Confirm reservation              |
| POST   | `/v1/reservations/:id/cancel`             | Cancel reservation               |
| POST   | `/v1/maintenance/expire-reservations`     | Expire old reservations          |

### Quick Examples

#### Create Item
```bash
curl -X POST http://localhost:3000/v1/items \
  -H "Content-Type: application/json" \
  -d '{
    "name": "White T-Shirt",
    "initial_quantity": 100
  }'
```

#### Get Item Status
```bash
curl http://localhost:3000/v1/items/{item_id}
```

#### Create Reservation
```bash
curl -X POST http://localhost:3000/v1/reservations \
  -H "Content-Type: application/json" \
  -d '{
    "item_id": "{item_id}",
    "customer_id": "customer_123",
    "quantity": 5
  }'
```

#### Confirm Reservation
```bash
curl -X POST http://localhost:3000/v1/reservations/{reservation_id}/confirm
```

For complete API documentation, see:
- [API_SPECIFICATION.md](./API_SPECIFICATION.md)
- Swagger UI: `http://localhost:3000/docs`
- OpenAPI JSON: `http://localhost:3000/openapi.json`

---

## Concurrency Guarantees

### The Problem

When multiple clients simultaneously try to reserve the same inventory, there's a risk of **overselling** (reserving more units than available).

### Our Solution

We use **database-driven consistency** to prevent overselling:

#### 1. Pessimistic Locking with `SELECT ... FOR UPDATE`

When creating a reservation:
```sql
BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;

-- Lock the item row (other transactions must wait)
SELECT total_quantity FROM items WHERE id = $1 FOR UPDATE;

-- Calculate available quantity
SELECT SUM(quantity) FROM reservations
WHERE item_id = $1 AND status = 'PENDING' AND expires_at > NOW();

-- Verify sufficient availability, then insert
INSERT INTO reservations (...) VALUES (...);

COMMIT;
```

**Why this works:**
- `FOR UPDATE` locks the item row
- Concurrent reservations are serialized (wait in queue)
- Calculations happen inside transaction boundary
- First 50 succeed, next 150 fail with HTTP 409

#### 2. Idempotent State Transitions

**Confirm (idempotent):**
```sql
UPDATE reservations
SET status = 'CONFIRMED', confirmed_at = NOW()
WHERE id = $1 AND status = 'PENDING' AND expires_at > NOW()
RETURNING *;
```
- If already confirmed: Returns 0 rows, API returns success
- If expired: Returns 0 rows, API returns error

**Cancel (idempotent):**
```sql
UPDATE reservations
SET status = 'CANCELLED', cancelled_at = NOW()
WHERE id = $1 AND status = 'PENDING'
RETURNING *;
```
- If already cancelled: Returns 0 rows, API returns success
- If confirmed: Returns 0 rows, API returns error

#### 3. Race Condition Handling

| Race Scenario                       | Protection Mechanism                              |
|-------------------------------------|---------------------------------------------------|
| 200 concurrent reservations for 50 units | Row-level lock on item, serialized execution      |
| Confirm vs Expire                   | Mutually exclusive WHERE clauses                  |
| Cancel vs Confirm                   | Optimistic locking with status check              |
| Multiple Expire calls               | Atomic batch UPDATE, each row expired once        |

### SQL Guarantees Enforcing Invariant

1. **Transaction Isolation:** SERIALIZABLE prevents phantom reads
2. **Row-Level Locks:** `SELECT ... FOR UPDATE` serializes access
3. **Atomic Updates:** Single UPDATE statement with WHERE clause
4. **Constraints:** Database-level validation (positive quantities, valid statuses)
5. **Indexes:** Fast lookups ensure minimal lock duration

For more details, see [ARCHITECTURE.md](./ARCHITECTURE.md#concurrency-strategy).

---

## Testing

### Unit Tests

```bash
npm test
```

Tests individual functions and validation logic.

### Integration Tests

```bash
npm run test:integration
```

Tests API endpoints with real database interactions.

### Concurrency Tests (Critical)

```bash
npm run test:concurrency
```

**This test proves the system prevents overselling under high concurrency.**

#### Test Scenario 1: Overselling Prevention

1. Create item with `total_quantity = 50`
2. Fire 200 concurrent reservation requests (1 unit each)
3. **Expected Result:**
   - 50 requests succeed (HTTP 201)
   - 150 requests fail (HTTP 409 - Insufficient Quantity)
4. Verify invariant: `confirmed + pending ≤ total`

#### Test Scenario 2: Confirm vs Expire Race

1. Create reservations near expiry
2. Simultaneously call `/confirm` and `/maintenance/expire-reservations`
3. Verify only one succeeds per reservation

#### Test Scenario 3: Cancel vs Confirm Race

1. Create reservations
2. Simultaneously call `/cancel` and `/confirm`
3. Verify only one succeeds per reservation

#### Test Scenario 4: Multiple Expire Calls

1. Create expired reservations
2. Call `/maintenance/expire-reservations` 10 times concurrently
3. Verify each reservation expired exactly once

### Manual Testing with Swagger

1. Start the server: `npm run dev`
2. Open: `http://localhost:3000/docs`
3. Use Swagger UI to test endpoints interactively

---

## Deployment

### Deploy to Vercel

#### 1. Install Vercel CLI

```bash
npm install -g vercel
```

#### 2. Login to Vercel

```bash
vercel login
```

#### 3. Configure Environment Variables

In Vercel dashboard or via CLI:

```bash
vercel env add SUPABASE_URL
vercel env add SUPABASE_ANON_KEY
vercel env add SUPABASE_SERVICE_ROLE_KEY
vercel env add RESERVATION_EXPIRY_MINUTES
```

#### 4. Deploy

```bash
vercel
```

For production:
```bash
vercel --prod
```

#### 5. Verify Deployment

```bash
curl https://your-app.vercel.app/health
```

### Vercel Configuration

The project includes `vercel.json`:

```json
{
  "version": 2,
  "builds": [
    {
      "src": "dist/index.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "dist/index.js"
    }
  ]
}
```

### Environment Variables

Required in production:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NODE_ENV=production`
- `RESERVATION_EXPIRY_MINUTES` (default: 10)

---

## Known Limitations

### Timebox Constraints (4 hours)

Due to the time constraint, the following were not implemented:

1. **Automatic Expiration**
   - Current: Manual trigger via POST endpoint
   - Ideal: Background cron job (Vercel Cron or separate worker)

2. **Authentication**
   - Current: No auth required
   - Ideal: JWT tokens, API keys, rate limiting per customer

3. **Partial Confirmation**
   - Current: Must confirm entire reservation
   - Ideal: Confirm fewer units than reserved

4. **Inventory Restocking**
   - Current: Items created with fixed quantity
   - Ideal: Endpoint to add more units to existing items

5. **Soft Deletes**
   - Current: Status-based (CANCELLED, EXPIRED)
   - Ideal: Separate archived table for old reservations

6. **Advanced Monitoring**
   - Current: Basic logging
   - Ideal: Structured logging (Winston), metrics (Prometheus), tracing (OpenTelemetry)

7. **Caching**
   - Current: No caching
   - Ideal: Redis cache for item availability queries

8. **Reservation Extension**
   - Current: Fixed 10-minute expiry
   - Ideal: Endpoint to extend expiration time

### Technical Debt

1. **Error Messages:** Could be more detailed for debugging
2. **Input Sanitization:** Basic validation, could be more robust
3. **Database Connection Pooling:** Using defaults, could be optimized
4. **Test Coverage:** Core paths covered, edge cases need more tests

---

## Design Decisions

### Why PostgreSQL Row-Level Locking?

**Alternatives Considered:**
1. **Optimistic Locking (version numbers):** Higher retry rate under contention
2. **Redis Distributed Locks:** Adds dependency, network overhead
3. **Application-Level Locks:** Not horizontally scalable

**Chosen Approach:** Pessimistic locking with `SELECT ... FOR UPDATE`
- **Pros:** Guaranteed consistency, built into PostgreSQL, no external dependencies
- **Cons:** Serialized access (slower under extreme contention)

### Why SERIALIZABLE Isolation Level?

Prevents phantom reads during availability calculation. Ensures the set of pending reservations doesn't change between SELECT and INSERT.

### Why Status-Based State Machine?

**Alternatives:**
1. **Separate tables per status:** Harder to query, more complex migrations
2. **Boolean flags (is_confirmed, is_cancelled):** Ambiguous states possible

**Chosen Approach:** Single `status` column with CHECK constraint
- **Pros:** Clear state machine, easy to query, single source of truth
- **Cons:** Can't have multiple statuses simultaneously (acceptable for this use case)

### Why 10-Minute Expiration?

**Trade-offs:**
- **Shorter (5 min):** Less holding of inventory, higher pressure on customers
- **Longer (30 min):** More blocked inventory, worse for high-demand items

**Chosen:** 10 minutes balances customer convenience with inventory efficiency. Configurable via environment variable.

### Why UUIDs Instead of Auto-Incrementing IDs?

**Pros:**
- Prevents enumeration attacks (can't guess valid IDs)
- Can generate client-side (distributed systems)
- Merge databases without conflicts

**Cons:**
- Larger storage (16 bytes vs 4 bytes)
- Slower index lookups (negligible at this scale)

---

## Project Structure

```
.
├── src/
│   ├── controllers/       # HTTP request handlers
│   ├── services/          # Business logic
│   ├── repositories/      # Database access layer
│   ├── middleware/        # Express middleware (validation, error handling)
│   ├── types/             # TypeScript type definitions
│   ├── config/            # Configuration (database, env)
│   ├── routes/            # API route definitions
│   └── index.ts           # Application entry point
├── tests/
│   ├── unit/              # Unit tests
│   ├── integration/       # Integration tests
│   └── concurrency/       # Concurrency proof tests
├── migration.sql          # Database schema
├── .env.example           # Environment variable template
├── vercel.json            # Vercel deployment config
├── tsconfig.json          # TypeScript configuration
├── package.json           # Dependencies and scripts
├── ARCHITECTURE.md        # System design documentation
├── DATABASE_SCHEMA.md     # Database schema details
├── API_SPECIFICATION.md   # API endpoint documentation
└── README.md              # This file
```

---

## Assumptions

1. **Customer Identity:** Simple string `customer_id` (no authentication required)
2. **Single Currency:** No pricing or payment handling
3. **No Returns:** Confirmed reservations cannot be undone
4. **Fixed Inventory:** No restock endpoint (items created with initial quantity)
5. **Manual Expiration:** Expire endpoint called manually (no automatic background job)
6. **UTC Timestamps:** All times in UTC
7. **English-Only:** Error messages and docs in English
8. **Integer Quantities:** No fractional units (e.g., can't reserve 2.5 units)

---

## Troubleshooting

### Database Connection Issues

**Problem:** "Database connection failed"

**Solution:**
1. Verify `.env` has correct Supabase credentials
2. Check Supabase project is active
3. Ensure network access (firewalls, VPN)
4. Test connection:
   ```bash
   curl https://your-project.supabase.co/rest/v1/
   ```

### Migration Errors

**Problem:** "Table already exists"

**Solution:**
```sql
-- Drop and recreate
DROP TABLE IF EXISTS reservations CASCADE;
DROP TABLE IF EXISTS items CASCADE;
-- Then run migration.sql again
```

### Concurrency Test Failures

**Problem:** "Expected 50 successes, got 48"

**Possible Causes:**
1. Database connection pool exhausted
2. Transaction timeout
3. Network latency

**Solution:**
- Increase database connection pool size
- Check database performance metrics in Supabase dashboard

### Vercel Deployment Issues

**Problem:** "Function timeout"

**Solution:**
- Ensure database queries are optimized
- Check indexes exist
- Reduce transaction scope
- Consider Vercel Pro for longer timeout (10s → 60s)

---

## Contributing

This is a take-home assignment project. Not accepting external contributions.

---

## License

MIT License - See LICENSE file for details.

---

## Contact

For questions about this implementation:
- **Developer:** [Your Name]
- **Email:** [Your Email]
- **GitHub:** [Your GitHub Profile]

---

## Acknowledgments

- **Supabase:** For managed PostgreSQL
- **Vercel:** For serverless deployment
- **Express.js:** For API framework
- **PostgreSQL:** For ACID guarantees enabling strong consistency
