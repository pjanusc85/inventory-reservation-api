# Testing Guide

## Overview

This guide explains how to run all tests, including the critical concurrency tests that prove the system prevents overselling.

---

## Prerequisites

1. **Database Setup:**
   - Supabase project created
   - Migration script (`migration.sql`) executed
   - `.env` file configured with Supabase credentials

2. **Dependencies Installed:**
   ```bash
   npm install
   ```

3. **Server Running (for some tests):**
   ```bash
   npm run dev
   ```

---

## Test Suites

### 1. Unit Tests

**What they test:** Individual functions, validation logic, utility functions

**How to run:**
```bash
npm test
```

**Coverage areas:**
- Input validation schemas
- Business logic calculations
- Error response formatting
- Utility functions (date handling, UUID validation)

**Expected output:**
```
PASS  tests/unit/validation.test.ts
PASS  tests/unit/calculations.test.ts
PASS  tests/unit/utils.test.ts

Test Suites: 3 passed, 3 total
Tests:       24 passed, 24 total
```

---

### 2. Integration Tests

**What they test:** API endpoints with real database interactions

**How to run:**
```bash
npm run test:integration
```

**Coverage areas:**
- POST /v1/items (create item)
- GET /v1/items/:id (get item status)
- POST /v1/reservations (create reservation)
- POST /v1/reservations/:id/confirm (confirm reservation)
- POST /v1/reservations/:id/cancel (cancel reservation)
- POST /v1/maintenance/expire-reservations (expire old reservations)

**Example test scenarios:**
1. Create item with valid data → 201 Created
2. Create item with negative quantity → 400 Bad Request
3. Get item that doesn't exist → 404 Not Found
4. Reserve more than available → 409 Conflict
5. Confirm expired reservation → 409 Conflict
6. Confirm twice (idempotency) → 200 OK both times

**Expected output:**
```
PASS  tests/integration/items.test.ts
PASS  tests/integration/reservations.test.ts
PASS  tests/integration/maintenance.test.ts

Test Suites: 3 passed, 3 total
Tests:       42 passed, 42 total
```

---

### 3. Concurrency Tests (CRITICAL)

**What they test:** System behavior under high concurrency, proving the core invariant holds

**How to run:**
```bash
npm run test:concurrency
```

**This is the most important test.** It demonstrates that the system prevents overselling even when 200 concurrent requests try to reserve units from an item with only 50 available.

#### Test Scenario 1: Overselling Prevention

**Setup:**
- Create item with `total_quantity = 50`
- Fire 200 concurrent POST requests to `/v1/reservations` (1 unit each)

**Expected Results:**
- ✅ Exactly 50 requests succeed (HTTP 201)
- ✅ Exactly 150 requests fail (HTTP 409 - Insufficient Quantity)
- ✅ Database state: `SUM(pending_quantity) = 50`
- ✅ Invariant holds: `pending + confirmed ≤ total`

**What this proves:**
- Row-level locking works correctly
- No race conditions during availability calculation
- Zero overselling incidents

**Example output:**
```
Concurrency Test 1: Overselling Prevention
============================================
Creating test item with quantity 50...
Firing 200 concurrent reservation requests...

Results:
  Success (201): 50 requests
  Failure (409): 150 requests

Database verification:
  Total quantity: 50
  Pending reservations: 50
  Available: 0

✓ Invariant verified: pending (50) + confirmed (0) <= total (50)
✓ No overselling occurred
✓ Test passed!
```

#### Test Scenario 2: Confirm vs Expire Race

**Setup:**
- Create 10 reservations that expire in 1 second
- Wait for expiration
- Simultaneously call:
  - `/v1/reservations/:id/confirm` (for each reservation)
  - `/v1/maintenance/expire-reservations` (multiple times)

**Expected Results:**
- Each reservation ends in exactly one final state (CONFIRMED or EXPIRED)
- No reservation is both confirmed and expired
- Quantity correctly released or permanently deducted

**Example output:**
```
Concurrency Test 2: Confirm vs Expire Race
============================================
Creating 10 reservations...
Waiting for expiration...
Firing concurrent confirm and expire requests...

Results:
  Confirmed: 3 reservations
  Expired: 7 reservations
  Double-processed: 0 (PASS)

✓ No reservation processed twice
✓ Test passed!
```

#### Test Scenario 3: Cancel vs Confirm Race

**Setup:**
- Create 20 reservations
- For each reservation, simultaneously call:
  - `/v1/reservations/:id/confirm`
  - `/v1/reservations/:id/cancel`

**Expected Results:**
- Each reservation ends in either CONFIRMED or CANCELLED (not both)
- First operation wins, second fails gracefully
- Quantity correctly handled in all cases

**Example output:**
```
Concurrency Test 3: Cancel vs Confirm Race
============================================
Creating 20 reservations...
Firing concurrent cancel and confirm requests...

Results:
  Confirmed: 12 reservations
  Cancelled: 8 reservations
  Invalid state: 0 (PASS)

✓ No reservation in invalid state
✓ Test passed!
```

#### Test Scenario 4: Multiple Concurrent Expire Calls

**Setup:**
- Create 50 expired reservations
- Call `/v1/maintenance/expire-reservations` 10 times concurrently

**Expected Results:**
- Each reservation expired exactly once
- Total expired count = 50 (not 50 * 10 = 500)
- Idempotency maintained

**Example output:**
```
Concurrency Test 4: Multiple Expire Calls
============================================
Creating 50 expired reservations...
Calling expire endpoint 10 times concurrently...

Results:
  Total reservations created: 50
  Total expired across all calls: 50
  Duplicate expirations: 0 (PASS)

✓ Each reservation expired exactly once
✓ Idempotency verified
✓ Test passed!
```

---

## Running All Tests Together

```bash
npm run test:all
```

This runs:
1. Unit tests
2. Integration tests
3. Concurrency tests

**Expected final output:**
```
============================================
All Tests Summary
============================================
Unit Tests:         24/24 passed
Integration Tests:  42/42 passed
Concurrency Tests:  4/4 passed
--------------------------------------------
Total:              70/70 passed
============================================
✓ All tests passed successfully!
```

---

## Manual Testing with cURL

### Complete Flow Example

```bash
# 1. Create an item
curl -X POST http://localhost:3000/v1/items \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Item", "initial_quantity": 10}'

# Response: Save the item_id

# 2. Check availability
curl http://localhost:3000/v1/items/{item_id}

# 3. Create reservation
curl -X POST http://localhost:3000/v1/reservations \
  -H "Content-Type: application/json" \
  -d '{
    "item_id": "{item_id}",
    "customer_id": "test_customer",
    "quantity": 3
  }'

# Response: Save the reservation_id

# 4. Check availability again (should be reduced)
curl http://localhost:3000/v1/items/{item_id}

# 5. Confirm reservation
curl -X POST http://localhost:3000/v1/reservations/{reservation_id}/confirm

# 6. Try to confirm again (should still return success - idempotent)
curl -X POST http://localhost:3000/v1/reservations/{reservation_id}/confirm

# 7. Final availability check
curl http://localhost:3000/v1/items/{item_id}
```

---

## Testing Concurrency Manually with Apache Bench (ab)

### Test: 200 Concurrent Reservations

**Prerequisites:**
```bash
# Install Apache Bench (macOS)
brew install httpd

# Or on Ubuntu/Debian
sudo apt-get install apache2-utils
```

**Prepare request body:**
```bash
# Create a file: reservation_request.json
echo '{
  "item_id": "YOUR_ITEM_ID",
  "customer_id": "concurrent_test",
  "quantity": 1
}' > reservation_request.json
```

**Run concurrent requests:**
```bash
ab -n 200 -c 200 -p reservation_request.json -T application/json \
  http://localhost:3000/v1/reservations
```

**Analyze results:**
- Check "Complete requests" = 200
- Look at status code distribution:
  - 2xx responses = successful reservations (should be 50)
  - 4xx responses = conflicts (should be 150)

**Verify in database:**
```sql
-- Check pending reservations
SELECT COUNT(*), SUM(quantity)
FROM reservations
WHERE item_id = 'YOUR_ITEM_ID'
  AND status = 'PENDING'
  AND expires_at > NOW();

-- Should return: count=50, sum=50
```

---

## Testing with Swagger UI

1. **Start server:**
   ```bash
   npm run dev
   ```

2. **Open Swagger UI:**
   ```
   http://localhost:3000/docs
   ```

3. **Interactive testing:**
   - Click on an endpoint
   - Click "Try it out"
   - Fill in parameters
   - Click "Execute"
   - View response

4. **Recommended test flow in Swagger:**
   1. POST /v1/items (create item)
   2. GET /v1/items/:id (verify creation)
   3. POST /v1/reservations (create reservation)
   4. GET /v1/items/:id (check reduced availability)
   5. POST /v1/reservations/:id/confirm (confirm)
   6. GET /v1/items/:id (verify permanent reduction)

---

## Debugging Failed Tests

### Test fails: "Database connection error"

**Cause:** Can't connect to Supabase

**Solutions:**
1. Check `.env` has correct SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
   - Note: Both legacy JWT keys and new `sb_secret_...` format are supported
2. Verify Supabase project is active
3. Check network/firewall settings
4. Test connection:
   ```bash
   curl https://your-project.supabase.co/rest/v1/
   ```

### Test fails: "Table does not exist"

**Cause:** Migration not run

**Solution:**
1. Open Supabase SQL Editor
2. Run `migration.sql`
3. Verify tables exist:
   ```sql
   SELECT table_name FROM information_schema.tables
   WHERE table_schema = 'public';
   ```

### Concurrency test fails intermittently

**Cause:** Transaction timeout or connection pool exhausted

**Solutions:**
1. Increase database connection pool size in `.env`:
   ```env
   DB_POOL_MAX=20
   ```
2. Increase transaction timeout
3. Check Supabase performance metrics
4. Try running test again (network latency can cause flakiness)

### Test fails: "Expected 50 successes, got 48"

**Cause:** Race condition or database performance issue

**Investigation:**
1. Check Supabase dashboard for errors
2. Verify indexes exist:
   ```sql
   SELECT indexname FROM pg_indexes
   WHERE tablename IN ('items', 'reservations');
   ```
3. Check transaction isolation level
4. Review logs for transaction rollbacks

---

## Performance Benchmarks

### Expected Response Times (p95)

| Endpoint                          | Expected (ms) | Acceptable (ms) |
|-----------------------------------|---------------|-----------------|
| POST /v1/items                    | < 100         | < 200           |
| GET /v1/items/:id                 | < 50          | < 100           |
| POST /v1/reservations             | < 200         | < 500           |
| POST /v1/reservations/:id/confirm | < 100         | < 200           |
| POST /v1/reservations/:id/cancel  | < 100         | < 200           |
| POST /v1/maintenance/expire       | < 500         | < 1000          |

### Concurrency Performance

**Test:** 200 concurrent reservation requests

**Expected:**
- Total completion time: < 5 seconds
- Zero overselling incidents
- All transactions complete successfully (50 success + 150 failure)

**If slower than expected:**
1. Check database connection pool size
2. Verify indexes are present
3. Check Supabase instance size (upgrade if needed)
4. Review query execution plans with EXPLAIN ANALYZE

---

## Continuous Integration

### GitHub Actions Example

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm install

      - name: Run unit tests
        run: npm test

      - name: Run integration tests
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
        run: npm run test:integration

      - name: Run concurrency tests
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
        run: npm run test:concurrency
```

---

## Test Data Cleanup

### Clean up test data after manual testing

```sql
-- Delete all test reservations
DELETE FROM reservations
WHERE customer_id LIKE 'test_%';

-- Delete all test items
DELETE FROM items
WHERE name LIKE 'Test%';

-- Or reset everything (CAUTION: Deletes all data)
TRUNCATE TABLE reservations CASCADE;
TRUNCATE TABLE items CASCADE;
```

---

## Additional Testing Tools

### Postman Collection

Import the included `postman_collection.json` for pre-configured API requests.

### k6 Load Testing (Advanced)

```javascript
// load_test.js
import http from 'k6/http';
import { check } from 'k6';

export let options = {
  vus: 50, // 50 virtual users
  duration: '30s',
};

export default function () {
  let payload = JSON.stringify({
    item_id: 'YOUR_ITEM_ID',
    customer_id: `customer_${__VU}_${__ITER}`,
    quantity: 1,
  });

  let res = http.post('http://localhost:3000/v1/reservations', payload, {
    headers: { 'Content-Type': 'application/json' },
  });

  check(res, {
    'status is 201 or 409': (r) => r.status === 201 || r.status === 409,
  });
}
```

Run with:
```bash
k6 run load_test.js
```

---

## Troubleshooting Checklist

- [ ] `.env` file exists and has correct values
- [ ] Supabase project is active
- [ ] Migration script has been run
- [ ] Tables and indexes exist
- [ ] Dependencies installed (`npm install`)
- [ ] Server can connect to database (`npm run dev`)
- [ ] No firewall blocking Supabase connection
- [ ] Node.js version >= 18

---

## Getting Help

If tests continue to fail:

1. Check server logs: Look for error messages in console
2. Check Supabase logs: Database > Logs in Supabase dashboard
3. Run verification queries from `migration.sql`
4. Review API response errors for specific error codes
5. Enable SQL query logging: Set `LOG_SQL_QUERIES=true` in `.env`
