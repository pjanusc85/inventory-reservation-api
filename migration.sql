-- ============================================================================
-- Inventory Reservation API - Database Migration
-- ============================================================================
-- Purpose: Create tables, constraints, indexes, and foreign keys for the
--          inventory reservation system with strong concurrency guarantees.
--
-- How to run:
-- 1. Log in to Supabase Dashboard
-- 2. Navigate to SQL Editor
-- 3. Copy and paste this entire file
-- 4. Click "Run"
--
-- Rollback (if needed):
-- DROP TABLE IF EXISTS reservations CASCADE;
-- DROP TABLE IF EXISTS items CASCADE;
-- DROP EXTENSION IF EXISTS "uuid-ossp" CASCADE;
-- ============================================================================

-- Enable UUID extension for generating UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- Table: items
-- ============================================================================
-- Stores product inventory information
-- Each item has a fixed total_quantity that represents the maximum units
-- ============================================================================

CREATE TABLE IF NOT EXISTS items (
    -- Primary key: UUID for security (prevents enumeration attacks)
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Product name (e.g., "White T-Shirt", "Blue Jeans")
    name VARCHAR(255) NOT NULL,

    -- Total units of this item (never changes after creation in this version)
    -- Must be positive
    total_quantity INTEGER NOT NULL CHECK (total_quantity > 0),

    -- Audit timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add comment for documentation
COMMENT ON TABLE items IS 'Inventory items with fixed total quantities';
COMMENT ON COLUMN items.id IS 'Unique identifier (UUID)';
COMMENT ON COLUMN items.name IS 'Product name';
COMMENT ON COLUMN items.total_quantity IS 'Total units available (immutable in this version)';

-- ============================================================================
-- Table: reservations
-- ============================================================================
-- Stores temporary holds (reservations) on inventory
-- Status-based state machine: PENDING → CONFIRMED/CANCELLED/EXPIRED
-- ============================================================================

CREATE TABLE IF NOT EXISTS reservations (
    -- Primary key: UUID
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Foreign key to items table
    item_id UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,

    -- Customer identifier (simple string, no auth required)
    customer_id VARCHAR(255) NOT NULL,

    -- Number of units reserved (must be positive)
    quantity INTEGER NOT NULL CHECK (quantity > 0),

    -- Status: PENDING, CONFIRMED, CANCELLED, EXPIRED
    -- State transitions:
    --   PENDING → CONFIRMED (before expiry)
    --   PENDING → CANCELLED (any time)
    --   PENDING → EXPIRED (after expiry)
    --   Terminal states: CONFIRMED, CANCELLED, EXPIRED
    status VARCHAR(20) NOT NULL CHECK (status IN ('PENDING', 'CONFIRMED', 'CANCELLED', 'EXPIRED')),

    -- Expiration time (reservations auto-expire if not confirmed)
    -- Must be after creation time
    expires_at TIMESTAMPTZ NOT NULL,

    -- Audit timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    confirmed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    expired_at TIMESTAMPTZ,

    -- Constraint: expires_at must be after created_at
    CONSTRAINT reservations_expires_after_creation CHECK (expires_at > created_at)
);

-- Add comments for documentation
COMMENT ON TABLE reservations IS 'Temporary holds on inventory with expiration and status tracking';
COMMENT ON COLUMN reservations.id IS 'Unique identifier (UUID)';
COMMENT ON COLUMN reservations.item_id IS 'Reference to items table';
COMMENT ON COLUMN reservations.customer_id IS 'Customer identifier (no auth required)';
COMMENT ON COLUMN reservations.quantity IS 'Number of units reserved';
COMMENT ON COLUMN reservations.status IS 'Current state: PENDING, CONFIRMED, CANCELLED, EXPIRED';
COMMENT ON COLUMN reservations.expires_at IS 'When this reservation expires (if PENDING)';

-- ============================================================================
-- Indexes
-- ============================================================================
-- Optimized for common query patterns:
-- 1. Get item availability (most frequent)
-- 2. Find expired reservations (batch operation)
-- 3. Customer lookup (for customer-facing features)
-- ============================================================================

-- Index for fast item lookups (Primary key index is automatic)
-- Used in: GET /v1/items/:id
CREATE INDEX IF NOT EXISTS idx_items_id ON items(id);

-- Index for foreign key lookups (speeds up JOINs)
-- Used in: All queries joining items and reservations
CREATE INDEX IF NOT EXISTS idx_reservations_item_id ON reservations(item_id);

-- Composite index for availability queries (MOST IMPORTANT FOR PERFORMANCE)
-- Used in: Calculating available quantity (item_id + active reservations)
-- Query pattern: WHERE item_id = ? AND status = 'PENDING' AND expires_at > NOW()
CREATE INDEX IF NOT EXISTS idx_reservations_item_status_expires
    ON reservations(item_id, status, expires_at);

-- Index for expire maintenance job
-- Used in: POST /v1/maintenance/expire-reservations
-- Query pattern: WHERE status = 'PENDING' AND expires_at <= NOW()
CREATE INDEX IF NOT EXISTS idx_reservations_status_expires
    ON reservations(status, expires_at);

-- Index for customer lookup (optional, useful for customer-facing features)
-- Used in: GET /v1/reservations?customer_id=...
CREATE INDEX IF NOT EXISTS idx_reservations_customer_id ON reservations(customer_id);

-- ============================================================================
-- Functions (For Concurrency Control)
-- ============================================================================

-- ============================================================================
-- Function: create_reservation_atomic
-- ============================================================================
-- Creates a reservation with proper row-level locking to prevent overselling
-- Uses SELECT ... FOR UPDATE to lock the item row during availability check
-- This ensures no race conditions under concurrent load
--
-- Parameters:
--   p_item_id: UUID of the item to reserve
--   p_customer_id: Customer identifier
--   p_quantity: Number of units to reserve
--   p_expires_at: When the reservation expires
--
-- Returns:
--   UUID of the created reservation, or NULL if insufficient quantity
--
-- Errors:
--   RAISE EXCEPTION if item not found
-- ============================================================================

CREATE OR REPLACE FUNCTION create_reservation_atomic(
    p_item_id UUID,
    p_customer_id VARCHAR(255),
    p_quantity INTEGER,
    p_expires_at TIMESTAMPTZ
)
RETURNS UUID AS $$
DECLARE
    v_total_quantity INTEGER;
    v_reserved_quantity INTEGER;
    v_confirmed_quantity INTEGER;
    v_available_quantity INTEGER;
    v_reservation_id UUID;
BEGIN
    -- Step 1: Lock the item row (other transactions will wait here)
    -- This is the critical section that prevents race conditions
    SELECT total_quantity INTO v_total_quantity
    FROM items
    WHERE id = p_item_id
    FOR UPDATE;  -- ← This is the key: row-level lock!

    -- Check if item exists
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Item not found: %', p_item_id;
    END IF;

    -- Step 2: Calculate reserved quantity (active pending reservations)
    SELECT COALESCE(SUM(quantity), 0) INTO v_reserved_quantity
    FROM reservations
    WHERE item_id = p_item_id
      AND status = 'PENDING'
      AND expires_at > NOW();

    -- Step 3: Calculate confirmed quantity
    SELECT COALESCE(SUM(quantity), 0) INTO v_confirmed_quantity
    FROM reservations
    WHERE item_id = p_item_id
      AND status = 'CONFIRMED';

    -- Step 4: Calculate available quantity
    v_available_quantity := v_total_quantity - v_reserved_quantity - v_confirmed_quantity;

    -- Step 5: Check if enough quantity available
    IF v_available_quantity < p_quantity THEN
        -- Not enough inventory - return NULL
        -- (caller will handle insufficient quantity error)
        RETURN NULL;
    END IF;

    -- Step 6: Create the reservation
    INSERT INTO reservations (
        item_id,
        customer_id,
        quantity,
        status,
        expires_at
    ) VALUES (
        p_item_id,
        p_customer_id,
        p_quantity,
        'PENDING',
        p_expires_at
    ) RETURNING id INTO v_reservation_id;

    -- Step 7: Return the reservation ID
    RETURN v_reservation_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION create_reservation_atomic IS 'Atomically create a reservation with row-level locking to prevent overselling';

-- ============================================================================
-- Function: update_updated_at_column
-- ============================================================================
-- Trigger function to automatically update updated_at timestamp
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to items table
-- Drop if exists, then create
DROP TRIGGER IF EXISTS update_items_updated_at ON items;
CREATE TRIGGER update_items_updated_at
    BEFORE UPDATE ON items
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Sample Data (Optional - for testing)
-- ============================================================================
-- Uncomment the section below to insert sample data for testing
-- ============================================================================

/*
-- Sample items
INSERT INTO items (id, name, total_quantity) VALUES
    ('550e8400-e29b-41d4-a716-446655440000', 'White T-Shirt', 100),
    ('550e8400-e29b-41d4-a716-446655440001', 'Blue Jeans', 50),
    ('550e8400-e29b-41d4-a716-446655440002', 'Red Hoodie', 25),
    ('550e8400-e29b-41d4-a716-446655440003', 'Black Sneakers', 75);

-- Sample reservations (for testing different statuses)
INSERT INTO reservations (item_id, customer_id, quantity, status, expires_at) VALUES
    -- Active pending reservation
    (
        '550e8400-e29b-41d4-a716-446655440000',
        'customer_001',
        5,
        'PENDING',
        NOW() + INTERVAL '10 minutes'
    ),
    -- Confirmed reservation
    (
        '550e8400-e29b-41d4-a716-446655440000',
        'customer_002',
        3,
        'CONFIRMED',
        NOW() + INTERVAL '10 minutes'
    ),
    -- Expired pending reservation (for testing expire endpoint)
    (
        '550e8400-e29b-41d4-a716-446655440001',
        'customer_003',
        2,
        'PENDING',
        NOW() - INTERVAL '5 minutes'
    ),
    -- Cancelled reservation
    (
        '550e8400-e29b-41d4-a716-446655440002',
        'customer_004',
        1,
        'CANCELLED',
        NOW() + INTERVAL '10 minutes'
    );

-- Update confirmed_at for confirmed reservation
UPDATE reservations
SET confirmed_at = NOW()
WHERE status = 'CONFIRMED';
*/

-- ============================================================================
-- Verification Queries
-- ============================================================================
-- Run these after migration to verify everything is set up correctly
-- ============================================================================

-- Check tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
    AND table_name IN ('items', 'reservations');
-- Expected: 2 rows (items, reservations)

-- Check indexes exist
SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public'
    AND tablename IN ('items', 'reservations');
-- Expected: Multiple indexes (6+ including primary keys)

-- Check constraints
SELECT
    tc.constraint_name,
    tc.constraint_type,
    tc.table_name
FROM information_schema.table_constraints tc
WHERE tc.table_schema = 'public'
    AND tc.table_name IN ('items', 'reservations')
ORDER BY tc.table_name, tc.constraint_type;
-- Expected: Primary keys, foreign keys, check constraints

-- Check foreign key relationship
SELECT
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_name = 'reservations';
-- Expected: 1 row (reservations.item_id → items.id)

-- ============================================================================
-- Performance Testing Queries
-- ============================================================================
-- Use EXPLAIN ANALYZE to verify indexes are being used
-- ============================================================================

/*
-- Test 1: Get item availability (should use idx_reservations_item_status_expires)
EXPLAIN ANALYZE
SELECT
    i.id,
    i.name,
    i.total_quantity,
    COALESCE(SUM(r.quantity) FILTER (
        WHERE r.status = 'PENDING' AND r.expires_at > NOW()
    ), 0) AS reserved_quantity
FROM items i
LEFT JOIN reservations r ON r.item_id = i.id
WHERE i.id = '550e8400-e29b-41d4-a716-446655440000'
GROUP BY i.id, i.name, i.total_quantity;

-- Test 2: Find expired reservations (should use idx_reservations_status_expires)
EXPLAIN ANALYZE
SELECT id, item_id, quantity
FROM reservations
WHERE status = 'PENDING'
    AND expires_at <= NOW();
*/

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- If all verification queries return expected results, migration is successful.
-- The database is now ready for the Inventory Reservation API.
-- ============================================================================

-- Final message
DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Migration completed successfully!';
    RAISE NOTICE 'Tables created: items, reservations';
    RAISE NOTICE 'Indexes created: 6 indexes';
    RAISE NOTICE 'Constraints: Primary keys, foreign keys, check constraints';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '1. Verify tables: SELECT * FROM items;';
    RAISE NOTICE '2. Run verification queries above';
    RAISE NOTICE '3. Configure API with Supabase credentials';
    RAISE NOTICE '========================================';
END $$;
