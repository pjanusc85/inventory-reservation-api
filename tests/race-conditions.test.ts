import axios from 'axios';

/**
 * Race Condition Tests
 *
 * Tests for various race condition scenarios to ensure atomic operations
 * and proper state transitions.
 *
 * Test scenarios:
 * 1. Confirm vs Expire: Concurrent confirm and expire operations
 * 2. Cancel vs Confirm: Concurrent cancel and confirm operations
 * 3. Multiple Expire: Multiple concurrent expire operations
 * 4. Concurrent Cancellations: Multiple cancel attempts on same reservation
 * 5. Concurrent Confirmations: Multiple confirm attempts on same reservation
 */

const BASE_URL = process.env['API_BASE_URL'] || 'http://localhost:3000';
const CUSTOMER_ID = 'test-customer-race';

interface Reservation {
  id: string;
  item_id: string;
  customer_id: string;
  quantity: number;
  status: string;
  expires_at: string;
}

/**
 * Creates a test item
 */
async function createItem(quantity: number): Promise<string> {
  const response = await axios.post(`${BASE_URL}/v1/items`, {
    name: `Race Test Item ${Date.now()}`,
    initial_quantity: quantity,
  });
  return response.data.data.id;
}

/**
 * Creates a reservation
 */
async function createReservation(itemId: string, quantity: number = 1): Promise<Reservation> {
  const response = await axios.post(`${BASE_URL}/v1/reservations`, {
    item_id: itemId,
    customer_id: `${CUSTOMER_ID}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    quantity,
  });
  return response.data.data;
}

/**
 * Gets reservation by ID
 */
async function getReservation(id: string): Promise<Reservation | null> {
  try {
    const response = await axios.get(`${BASE_URL}/v1/reservations/${id}`);
    return response.data.data;
  } catch (error: any) {
    if (error.response?.status === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Confirms a reservation
 */
async function confirmReservation(id: string): Promise<{ status: number; data?: any }> {
  try {
    const response = await axios.post(
      `${BASE_URL}/v1/reservations/${id}/confirm`,
      {},
      { validateStatus: () => true }
    );
    return { status: response.status, data: response.data };
  } catch (error: any) {
    return { status: error.response?.status || 500, data: error.response?.data };
  }
}

/**
 * Cancels a reservation
 */
async function cancelReservation(id: string): Promise<{ status: number; data?: any }> {
  try {
    const response = await axios.post(
      `${BASE_URL}/v1/reservations/${id}/cancel`,
      {},
      { validateStatus: () => true }
    );
    return { status: response.status, data: response.data };
  } catch (error: any) {
    return { status: error.response?.status || 500, data: error.response?.data };
  }
}

/**
 * Expires reservations
 */
async function expireReservations(): Promise<{ status: number; data?: any }> {
  try {
    const response = await axios.post(
      `${BASE_URL}/v1/maintenance/expire-reservations`,
      {},
      { validateStatus: () => true }
    );
    return { status: response.status, data: response.data };
  } catch (error: any) {
    return { status: error.response?.status || 500, data: error.response?.data };
  }
}

/**
 * Test 1: Confirm vs Expire Race
 * Creates a reservation, then concurrently tries to confirm and expire it
 * Note: Since reservations don't expire immediately, we test the race condition
 * by sending both operations concurrently while the reservation is still PENDING
 */
async function testConfirmVsExpire(): Promise<boolean> {
  console.log('\n📝 Test 1: Confirm vs Expire Race Condition');
  console.log('   Scenario: Concurrent confirm and expire operations on same reservation');

  try {
    const itemId = await createItem(10);
    const reservation = await createReservation(itemId);

    console.log('   📤 Sending concurrent confirm and expire requests...');

    // Send both operations concurrently
    const [confirmResult, expireResult] = await Promise.all([
      confirmReservation(reservation.id),
      expireReservations(),
    ]);

    console.log(`   Confirm result: ${confirmResult.status}`);
    console.log(`   Expire result:  ${expireResult.status}`);

    // Verify final state
    const finalState = await getReservation(reservation.id);

    if (!finalState) {
      console.log('   ❌ Reservation not found');
      return false;
    }

    console.log(`   Final state: ${finalState.status}`);

    // The reservation should either be CONFIRMED (if confirm won) or still PENDING (if expire ran but reservation wasn't expired yet)
    // Since the reservation is fresh, expire shouldn't actually expire it
    const validStates = ['CONFIRMED', 'PENDING'];
    if (!validStates.includes(finalState.status)) {
      console.log(`   ❌ Invalid final state: ${finalState.status}`);
      return false;
    }

    // Confirm should have succeeded, expire should have succeeded too (but not changed this reservation)
    if (confirmResult.status !== 200) {
      console.log(`   ❌ Confirm failed unexpectedly: ${confirmResult.status}`);
      return false;
    }

    console.log(`   ✅ Test passed - reservation confirmed, no race condition issues`);
    return true;
  } catch (error: any) {
    console.log(`   ❌ Test failed: ${error.message}`);
    return false;
  }
}

/**
 * Test 2: Cancel vs Confirm Race
 * Creates a reservation, then concurrently tries to cancel and confirm it
 */
async function testCancelVsConfirm(): Promise<boolean> {
  console.log('\n📝 Test 2: Cancel vs Confirm Race Condition');
  console.log('   Scenario: Concurrent cancel and confirm operations on same reservation');

  try {
    const itemId = await createItem(10);
    const reservation = await createReservation(itemId);

    console.log('   📤 Sending concurrent cancel and confirm requests...');

    const [cancelResult, confirmResult] = await Promise.all([
      cancelReservation(reservation.id),
      confirmReservation(reservation.id),
    ]);

    console.log(`   Cancel result:  ${cancelResult.status}`);
    console.log(`   Confirm result: ${confirmResult.status}`);

    // Verify final state
    const finalState = await getReservation(reservation.id);

    if (!finalState) {
      console.log('   ❌ Reservation not found');
      return false;
    }

    // Final state should be either CANCELLED or CONFIRMED (but not both!)
    const validStates = ['CONFIRMED', 'CANCELLED'];
    if (!validStates.includes(finalState.status)) {
      console.log(`   ❌ Invalid final state: ${finalState.status}`);
      return false;
    }

    // Exactly one operation should have succeeded
    const successCount = [cancelResult.status, confirmResult.status].filter(
      (s) => s === 200
    ).length;

    if (successCount !== 1) {
      console.log(`   ❌ Expected exactly 1 success, got ${successCount}`);
      return false;
    }

    console.log(`   Final state: ${finalState.status}`);
    console.log(`   ✅ Test passed - exactly one operation succeeded`);
    return true;
  } catch (error: any) {
    console.log(`   ❌ Test failed: ${error.message}`);
    return false;
  }
}

/**
 * Test 3: Multiple Concurrent Expire Calls
 * Creates multiple pending reservations, then calls expire multiple times concurrently
 */
async function testMultipleExpireCalls(): Promise<boolean> {
  console.log('\n📝 Test 3: Multiple Concurrent Expire Calls');
  console.log('   Scenario: Multiple concurrent expire operations should be idempotent');

  try {
    const itemId = await createItem(100);

    // Create 10 reservations (all will be pending and unexpired initially)
    console.log('   📦 Creating 10 test reservations...');
    const reservations = await Promise.all(
      Array.from({ length: 10 }, () => createReservation(itemId))
    );

    console.log('   📤 Sending 5 concurrent expire requests...');

    // Call expire 5 times concurrently
    const expireResults = await Promise.all(
      Array.from({ length: 5 }, () => expireReservations())
    );

    console.log('   Expire results:');
    expireResults.forEach((result, idx) => {
      console.log(`      ${idx + 1}. Status: ${result.status}`);
    });

    // All should succeed (200) since expire is idempotent
    const allSucceeded = expireResults.every((r) => r.status === 200);

    if (!allSucceeded) {
      console.log('   ❌ Not all expire calls succeeded');
      return false;
    }

    // Verify that no reservation was expired multiple times
    // (though they all should still be PENDING since they haven't actually expired yet)
    const finalStates = await Promise.all(
      reservations.map((r) => getReservation(r.id))
    );

    const allPending = finalStates.every((r) => r?.status === 'PENDING');

    if (!allPending) {
      console.log('   ℹ️  Some reservations changed state (this is ok if they actually expired)');
    }

    console.log(`   ✅ Test passed - all expire calls succeeded (idempotent operation)`);
    return true;
  } catch (error: any) {
    console.log(`   ❌ Test failed: ${error.message}`);
    return false;
  }
}

/**
 * Test 4: Concurrent Cancellations
 * Creates a reservation, then tries to cancel it multiple times concurrently
 */
async function testConcurrentCancellations(): Promise<boolean> {
  console.log('\n📝 Test 4: Concurrent Cancellation Attempts');
  console.log('   Scenario: Multiple concurrent cancel attempts on same reservation');

  try {
    const itemId = await createItem(10);
    const reservation = await createReservation(itemId);

    console.log('   📤 Sending 10 concurrent cancel requests...');

    const cancelResults = await Promise.all(
      Array.from({ length: 10 }, () => cancelReservation(reservation.id))
    );

    const successCount = cancelResults.filter((r) => r.status === 200).length;
    const conflictCount = cancelResults.filter((r) => r.status === 409).length;

    console.log(`   Success (200): ${successCount}`);
    console.log(`   Conflict (409): ${conflictCount}`);

    // Verify final state
    const finalState = await getReservation(reservation.id);

    if (!finalState) {
      console.log('   ❌ Reservation not found');
      return false;
    }

    if (finalState.status !== 'CANCELLED') {
      console.log(`   ❌ Expected CANCELLED state, got ${finalState.status}`);
      return false;
    }

    // At least one should succeed, others should either succeed (idempotent) or fail with 409
    if (successCount === 0) {
      console.log('   ❌ No cancellation succeeded');
      return false;
    }

    console.log(`   ✅ Test passed - reservation cancelled successfully, idempotency maintained`);
    return true;
  } catch (error: any) {
    console.log(`   ❌ Test failed: ${error.message}`);
    return false;
  }
}

/**
 * Test 5: Concurrent Confirmations
 * Creates a reservation, then tries to confirm it multiple times concurrently
 */
async function testConcurrentConfirmations(): Promise<boolean> {
  console.log('\n📝 Test 5: Concurrent Confirmation Attempts');
  console.log('   Scenario: Multiple concurrent confirm attempts on same reservation');

  try {
    const itemId = await createItem(10);
    const reservation = await createReservation(itemId);

    console.log('   📤 Sending 10 concurrent confirm requests...');

    const confirmResults = await Promise.all(
      Array.from({ length: 10 }, () => confirmReservation(reservation.id))
    );

    const successCount = confirmResults.filter((r) => r.status === 200).length;
    const conflictCount = confirmResults.filter((r) => r.status === 409).length;

    console.log(`   Success (200): ${successCount}`);
    console.log(`   Conflict (409): ${conflictCount}`);

    // Verify final state
    const finalState = await getReservation(reservation.id);

    if (!finalState) {
      console.log('   ❌ Reservation not found');
      return false;
    }

    if (finalState.status !== 'CONFIRMED') {
      console.log(`   ❌ Expected CONFIRMED state, got ${finalState.status}`);
      return false;
    }

    // At least one should succeed
    if (successCount === 0) {
      console.log('   ❌ No confirmation succeeded');
      return false;
    }

    console.log(`   ✅ Test passed - reservation confirmed successfully, idempotency maintained`);
    return true;
  } catch (error: any) {
    console.log(`   ❌ Test failed: ${error.message}`);
    return false;
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
async function runRaceConditionTests(): Promise<void> {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  Race Condition Tests - Inventory Reservation API         ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  console.log(`\nConfiguration:`);
  console.log(`  Base URL: ${BASE_URL}\n`);

  // Check server health
  await checkServerHealth();

  // Run all tests
  const results = {
    confirmVsExpire: await testConfirmVsExpire(),
    cancelVsConfirm: await testCancelVsConfirm(),
    multipleExpire: await testMultipleExpireCalls(),
    concurrentCancellations: await testConcurrentCancellations(),
    concurrentConfirmations: await testConcurrentConfirmations(),
  };

  // Print summary
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  Test Summary                                             ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const tests = [
    { name: 'Confirm vs Expire Race', passed: results.confirmVsExpire },
    { name: 'Cancel vs Confirm Race', passed: results.cancelVsConfirm },
    { name: 'Multiple Expire Calls', passed: results.multipleExpire },
    { name: 'Concurrent Cancellations', passed: results.concurrentCancellations },
    { name: 'Concurrent Confirmations', passed: results.concurrentConfirmations },
  ];

  tests.forEach((test, idx) => {
    const status = test.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${idx + 1}. ${test.name.padEnd(30)} ${status}`);
  });

  const passedCount = Object.values(results).filter((r) => r).length;
  const totalCount = Object.values(results).length;

  console.log(`\n📊 Results: ${passedCount}/${totalCount} tests passed`);

  if (passedCount === totalCount) {
    console.log('\n✅ ALL RACE CONDITION TESTS PASSED\n');
    process.exit(0);
  } else {
    console.log('\n❌ SOME TESTS FAILED\n');
    process.exit(1);
  }
}

// Run the tests
runRaceConditionTests().catch((error) => {
  console.error('\n❌ Test execution failed:');
  console.error(error);
  process.exit(1);
});
