#!/usr/bin/env node

/**
 * Minimal test script to understand p-queue interval behavior
 * Testing different configurations to see how interval and intervalCap work
 */

import PQueue from "p-queue";

console.log("🧪 Testing p-queue interval behavior\n");

// Helper function to create a delayed task with logging
function createTask(id, delay = 100) {
    return async () => {
        const startTime = new Date().toISOString().slice(11, 23); // HH:MM:SS.sss
        console.log(`  Task ${id}: Started at ${startTime}`);

        // Simulate some work
        await new Promise((resolve) => setTimeout(resolve, delay));

        const endTime = new Date().toISOString().slice(11, 23);
        console.log(`  Task ${id}: Finished at ${endTime}`);

        return `Task ${id} result`;
    };
}

// Test 1: Current implementation (concurrency + interval without intervalCap)
async function test1() {
    console.log(
        "📋 Test 1: Current implementation - concurrency: 1, interval: 3000 (NO intervalCap)",
    );
    console.log(
        "Expected: Should ignore interval, run tasks immediately one after another\n",
    );

    const queue = new PQueue({
        concurrency: 1,
        interval: 3000,
        // No intervalCap - this should ignore the interval!
    });

    const startTime = Date.now();

    // Add 3 tasks
    const promises = [
        queue.add(createTask("A")),
        queue.add(createTask("B")),
        queue.add(createTask("C")),
    ];

    await Promise.all(promises);

    const totalTime = Date.now() - startTime;
    console.log(`  ⏱️  Total time: ${totalTime}ms\n`);
}

// Test 2: Correct implementation with intervalCap
async function test2() {
    console.log(
        "📋 Test 2: With intervalCap - concurrency: 1, interval: 3000, intervalCap: 1",
    );
    console.log("Expected: Should enforce 3-second intervals between tasks\n");

    const queue = new PQueue({
        concurrency: 1,
        interval: 3000,
        intervalCap: 1, // This should enforce the interval!
    });

    const startTime = Date.now();

    // Add 3 tasks
    const promises = [
        queue.add(createTask("X")),
        queue.add(createTask("Y")),
        queue.add(createTask("Z")),
    ];

    await Promise.all(promises);

    const totalTime = Date.now() - startTime;
    console.log(`  ⏱️  Total time: ${totalTime}ms\n`);
}

// Test 3: Multiple tasks per interval
async function test3() {
    console.log(
        "📋 Test 3: Multiple per interval - concurrency: 3, interval: 2000, intervalCap: 2",
    );
    console.log(
        "Expected: Should run 2 tasks every 2 seconds, up to 3 concurrent\n",
    );

    const queue = new PQueue({
        concurrency: 3,
        interval: 2000,
        intervalCap: 2, // Allow 2 tasks per 2-second interval
    });

    const startTime = Date.now();

    // Add 5 tasks
    const promises = [
        queue.add(createTask("1")),
        queue.add(createTask("2")),
        queue.add(createTask("3")),
        queue.add(createTask("4")),
        queue.add(createTask("5")),
    ];

    await Promise.all(promises);

    const totalTime = Date.now() - startTime;
    console.log(`  ⏱️  Total time: ${totalTime}ms\n`);
}

// Run all tests
async function runTests() {
    try {
        await test1();
        await new Promise((resolve) => setTimeout(resolve, 1000)); // Pause between tests

        await test2();
        await new Promise((resolve) => setTimeout(resolve, 1000)); // Pause between tests

        await test3();

        console.log("✅ All tests completed!");
    } catch (error) {
        console.error("❌ Test failed:", error);
    }
}

runTests();
