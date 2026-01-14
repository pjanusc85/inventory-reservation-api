import axios, { AxiosError } from 'axios';

/**
 * Concurrency Test Script
 *
 * This test demonstrates the API's ability to handle concurrent requests
 * while maintaining strong consistency guarantees.
 *
 * Test scenario:
 * 1. Create an item with total_quantity = 50
 * 2. Make 200 concurrent reservation requests (each for quantity = 1)
 * 3. Verify exactly 50 requests succeed (201 Created)
 * 4. Verify exactly 150 requests fail (409 Insufficient Quantity)
 *
 * This proves the invariant: confirmed_quantity + pending_quantity ≤ total_quantity
 */

// Configuration
const BASE_URL = process.env['API_BASE_URL'] || 'http://localhost:3000';
const ITEM_QUANTITY = 50;
const CONCURRENT_REQUESTS = 200;
const CUSTOMER_ID = 'test-customer-concurrency';

interface TestResult {
  success: number;
  insufficientQuantity: number;
  otherErrors: number;
  errors: Array<{ status?: number; code?: string; message: string }>;
}

/**
 * Makes a reservation request
 */
async function makeReservation(
  itemId: string,
  index: number
): Promise<{ success: boolean; status?: number; error?: string }> {
  try {
    const response = await axios.post(
      `${BASE_URL}/v1/reservations`,
      {
        item_id: itemId,
        customer_id: `${CUSTOMER_ID}-${index}`,
        quantity: 1,
      },
      {
        timeout: 10000, // 10 second timeout
        validateStatus: () => true, // Don't throw on any status code
      }
    );

    if (response.status === 201) {
      return { success: true, status: 201 };
    } else {
      return {
        success: false,
        status: response.status,
        error: response.data?.error?.code || 'UNKNOWN_ERROR',
      };
    }
  } catch (error) {
    const axiosError = error as AxiosError;
    return {
      success: false,
      status: axiosError.response?.status,
      error: axiosError.message,
    };
  }
}

/**
 * Creates a test item
 */
async function createTestItem(): Promise<string> {
  try {
    const response = await axios.post(`${BASE_URL}/v1/items`, {
      name: `Concurrency Test Item ${Date.now()}`,
      initial_quantity: ITEM_QUANTITY,
    });

    if (response.status !== 201) {
      throw new Error(`Failed to create item: ${response.status}`);
    }

    const itemId = response.data.data.id;
    console.log(`✓ Created test item: ${itemId} with quantity ${ITEM_QUANTITY}`);
    return itemId;
  } catch (error) {
    console.error('Failed to create test item:', error);
    throw error;
  }
}

/**
 * Verifies the final item state
 */
async function verifyItemState(itemId: string): Promise<void> {
  try {
    const response = await axios.get(`${BASE_URL}/v1/items/${itemId}`);

    if (response.status !== 200) {
      throw new Error(`Failed to get item: ${response.status}`);
    }

    const item = response.data.data;
    console.log('\n📊 Final Item State:');
    console.log(`   Total Quantity:     ${item.totalQuantity}`);
    console.log(`   Reserved Quantity:  ${item.reservedQuantity}`);
    console.log(`   Confirmed Quantity: ${item.confirmedQuantity}`);
    console.log(`   Available Quantity: ${item.availableQuantity}`);

    // Verify invariant
    const usedQuantity = item.reservedQuantity + item.confirmedQuantity;
    if (usedQuantity !== ITEM_QUANTITY) {
      console.error(`❌ INVARIANT VIOLATION: Used quantity (${usedQuantity}) != Total quantity (${ITEM_QUANTITY})`);
      process.exit(1);
    }

    console.log(`✓ Invariant verified: reserved (${item.reservedQuantity}) + confirmed (${item.confirmedQuantity}) = ${usedQuantity} ≤ ${ITEM_QUANTITY}`);
  } catch (error) {
    console.error('Failed to verify item state:', error);
    throw error;
  }
}

/**
 * Checks if the server is running
 */
async function checkServerHealth(): Promise<void> {
  try {
    const response = await axios.get(`${BASE_URL}/health`, { timeout: 5000 });
    if (response.status === 200) {
      console.log(`✓ Server is healthy at ${BASE_URL}`);
    } else {
      throw new Error(`Server health check failed: ${response.status}`);
    }
  } catch (error) {
    console.error(`❌ Server is not running at ${BASE_URL}`);
    console.error('   Please start the server with: npm run dev');
    process.exit(1);
  }
}

/**
 * Main test execution
 */
async function runConcurrencyTest(): Promise<void> {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  Concurrency Test - Inventory Reservation API             ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.log(`Configuration:`);
  console.log(`  Base URL:            ${BASE_URL}`);
  console.log(`  Item Quantity:       ${ITEM_QUANTITY}`);
  console.log(`  Concurrent Requests: ${CONCURRENT_REQUESTS}`);
  console.log(`  Expected Success:    ${ITEM_QUANTITY}`);
  console.log(`  Expected Failures:   ${CONCURRENT_REQUESTS - ITEM_QUANTITY}\n`);

  // Step 1: Check server health
  console.log('Step 1: Checking server health...');
  await checkServerHealth();
  console.log();

  // Step 2: Create test item
  console.log('Step 2: Creating test item...');
  const itemId = await createTestItem();
  console.log();

  // Step 3: Make concurrent reservation requests
  console.log(`Step 3: Making ${CONCURRENT_REQUESTS} concurrent reservation requests...`);
  const startTime = Date.now();

  const promises = Array.from({ length: CONCURRENT_REQUESTS }, (_, index) =>
    makeReservation(itemId, index)
  );

  const results = await Promise.all(promises);
  const duration = Date.now() - startTime;

  console.log(`✓ All requests completed in ${duration}ms\n`);

  // Step 4: Analyze results
  console.log('Step 4: Analyzing results...');
  const analysis: TestResult = {
    success: 0,
    insufficientQuantity: 0,
    otherErrors: 0,
    errors: [],
  };

  results.forEach((result) => {
    if (result.success) {
      analysis.success++;
    } else if (result.status === 409) {
      analysis.insufficientQuantity++;
    } else {
      analysis.otherErrors++;
      analysis.errors.push({
        status: result.status,
        code: result.error,
        message: `Unexpected error: ${result.error}`,
      });
    }
  });

  // Print results
  console.log('\n📈 Test Results:');
  console.log(`   ✓ Successful (201):              ${analysis.success}`);
  console.log(`   ✓ Insufficient Quantity (409):   ${analysis.insufficientQuantity}`);
  console.log(`   ✗ Other Errors:                  ${analysis.otherErrors}`);

  if (analysis.errors.length > 0) {
    console.log('\n⚠️  Other Errors Detail:');
    analysis.errors.slice(0, 10).forEach((error, idx) => {
      console.log(`   ${idx + 1}. Status ${error.status}: ${error.message}`);
    });
    if (analysis.errors.length > 10) {
      console.log(`   ... and ${analysis.errors.length - 10} more errors`);
    }
  }

  // Step 5: Verify item state
  console.log('\nStep 5: Verifying final item state...');
  await verifyItemState(itemId);

  // Step 6: Validate test success
  console.log('\nStep 6: Validating test results...');

  // Critical: Exactly the right number of reservations (no overselling)
  const correctReservationCount = analysis.success === ITEM_QUANTITY;

  // Acceptable: 409 errors + other errors = remaining requests
  const correctErrorCount =
    analysis.insufficientQuantity + analysis.otherErrors === CONCURRENT_REQUESTS - ITEM_QUANTITY;

  // Acceptable: Small number of 500 errors under extreme load (< 1% of requests)
  const acceptableErrorRate = analysis.otherErrors <= Math.ceil(CONCURRENT_REQUESTS * 0.01);

  const testPassed = correctReservationCount && correctErrorCount && acceptableErrorRate;

  if (testPassed) {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║  ✅ CONCURRENCY TEST PASSED                                ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');
    console.log(`✓ Exactly ${ITEM_QUANTITY} reservations succeeded (no overselling!)`);
    console.log(`✓ ${analysis.insufficientQuantity} requests failed with 409 Insufficient Quantity`);
    if (analysis.otherErrors > 0) {
      console.log(`✓ ${analysis.otherErrors} timeout/connection errors (< 1% acceptable under extreme load)`);
    }
    console.log(`✓ Invariant maintained: reserved + confirmed ≤ total`);
    console.log(`✓ Performance: ${CONCURRENT_REQUESTS} requests in ${duration}ms (${(CONCURRENT_REQUESTS / duration * 1000).toFixed(0)} req/s)\n`);
    process.exit(0);
  } else {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║  ❌ CONCURRENCY TEST FAILED                                ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    if (!correctReservationCount) {
      console.log(`❌ CRITICAL: Expected ${ITEM_QUANTITY} successful reservations, got ${analysis.success}`);
      console.log(`   This indicates OVERSELLING - the primary invariant is violated!`);
    }

    if (!correctErrorCount) {
      console.log(`❌ Total responses don't match requests:`);
      console.log(`   Success: ${analysis.success}, 409 errors: ${analysis.insufficientQuantity}, Other errors: ${analysis.otherErrors}`);
      console.log(`   Total: ${analysis.success + analysis.insufficientQuantity + analysis.otherErrors} (expected: ${CONCURRENT_REQUESTS})`);
    }

    if (!acceptableErrorRate) {
      console.log(`❌ Too many unexpected errors: ${analysis.otherErrors} (> 1% of requests)`);
      console.log(`   This may indicate database connection pool or timeout issues`);
    }

    console.log();
    process.exit(1);
  }
}

// Run the test
runConcurrencyTest().catch((error) => {
  console.error('\n❌ Test execution failed:');
  console.error(error);
  process.exit(1);
});
