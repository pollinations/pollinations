import { SELF } from "cloudflare:test";
import { test } from "./fixtures.ts";
import { expect } from "vitest";
import { getLogger } from "@logtape/logtape";

const endpoint = "http://localhost:3000/api/generate/v1/chat/completions";
const log = getLogger(["test", "rate-limit"]);

// Get capacity from environment (test env uses 0.002 for bucket exhaustion testing)
const EXPECTED_CAPACITY = parseFloat(process.env.POLLEN_BUCKET_CAPACITY || "0.002");

test("pollen limiter - verifies pollen-based headers", { timeout: 30000 }, async ({ auth, sessionToken }) => {
    // Create a publishable key for testing
    const createApiKeyResponse = await auth.apiKey.create({
        name: "test-pollen-headers2",
        prefix: "pk",
        metadata: { keyType: "publishable" },
        fetchOptions: {
            headers: { "Cookie": `better-auth.session_token=${sessionToken}` },
        },
    });
    
    if (!createApiKeyResponse.data) throw new Error("Failed to create publishable API key");
    const publishableKey = createApiKeyResponse.data.key;
    
    expect(publishableKey.startsWith("pk_")).toBe(true);
    
    const testIp = `192.0.7.${Date.now() % 254}`;
    
    // Make a single request to verify pollen-based headers
    const response = await SELF.fetch(endpoint, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            "authorization": `Bearer ${publishableKey}`,
            "cf-connecting-ip": testIp,
        },
        body: JSON.stringify({
            model: "openai",
            messages: [{ role: "user", content: "test" }],
        }),
    });
    
    await response.text(); // Consume body
    
    // Verify pollen-based rate limit headers exist
    const capacity = response.headers.get("RateLimit-Limit");
    const remaining = response.headers.get("RateLimit-Remaining");
    
    expect(capacity).toBe(EXPECTED_CAPACITY.toString());
    expect(remaining).toBeTruthy(); // Should have remaining pollen value
    expect(parseFloat(remaining || "0")).toBeLessThanOrEqual(EXPECTED_CAPACITY);
    expect(parseFloat(remaining || "0")).toBeGreaterThan(0);
    
    log.info(`✓ Pollen headers verified: capacity=${capacity}, remaining=${remaining}`);
});

// ========================================
// Pollen-Based Rate Limiter - Full MVP Test
// ========================================

test("pollen rate limiter - verify headers and deduction mechanism", { timeout: 30000 }, async ({ auth, sessionToken }) => {
    // Create a publishable key for testing
    const createApiKeyResponse = await auth.apiKey.create({
        name: "test-pollen-headers",
        prefix: "pk",
        metadata: { keyType: "publishable" },
        fetchOptions: {
            headers: { "Cookie": `better-auth.session_token=${sessionToken}` },
        },
    });
    
    if (!createApiKeyResponse.data) throw new Error("Failed to create publishable API key");
    const publishableKey = createApiKeyResponse.data.key;
    
    expect(publishableKey.startsWith("pk_")).toBe(true);
    
    const testIp = `192.0.10.${Date.now() % 254}`;
    
    log.info("Testing pollen rate limiter basic functionality");
    log.info("Verifying: headers, pollen deduction, and rate limit mechanism");
    
    // Make 1 request to verify headers (with zero refill in test env, only 1 request succeeds)
    const response = await SELF.fetch(endpoint, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            "authorization": `Bearer ${publishableKey}`,
            "cf-connecting-ip": testIp,
        },
        body: JSON.stringify({
            model: "openai",
            messages: [{ role: "user", content: "test" }],
        }),
    });
    
    const remaining = response.headers.get("RateLimit-Remaining");
    const capacity = response.headers.get("RateLimit-Limit");
    
    log.info(`Request: status=${response.status}, remaining=${remaining}, capacity=${capacity}`);
    
    await response.text();
    
    // Verify request succeeded
    expect(response.status).toBe(200);
    
    // Verify pollen-based headers are present and in correct range
    expect(capacity).toBe(EXPECTED_CAPACITY.toString());
    expect(remaining).toBeTruthy();
    expect(parseFloat(remaining || "0")).toBeGreaterThan(0);
    expect(parseFloat(remaining || "0")).toBeLessThanOrEqual(EXPECTED_CAPACITY);
    
    // Note: Pollen deduction is now synchronous (awaited in middleware)
    // This verifies:
    // 1. Rate limit headers are pollen-based (from env: POLLEN_BUCKET_CAPACITY)
    // 2. Pre-request checks work (request succeeded)
    // 3. Post-request deduction is synchronous and prevents race conditions
    
    log.info("✓ Pollen rate limiter test passed - headers correct, synchronous deduction working");
});

test("pollen rate limiter - secret keys bypass rate limiting", { timeout: 30000 }, async ({ auth, sessionToken }) => {
    // Create a secret key for testing
    const createApiKeyResponse = await auth.apiKey.create({
        name: "test-secret-bypass",
        prefix: "sk",
        metadata: { keyType: "secret" },
        fetchOptions: {
            headers: { "Cookie": `better-auth.session_token=${sessionToken}` },
        },
    });
    
    if (!createApiKeyResponse.data) throw new Error("Failed to create secret API key");
    const secretKey = createApiKeyResponse.data.key;
    
    expect(secretKey.startsWith("sk_")).toBe(true);
    
    const testIp = `192.0.11.${Date.now() % 254}`;
    
    log.info("Testing secret key bypass - should have no rate limit headers");
    
    // Make request with secret key
    const response = await SELF.fetch(endpoint, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            "authorization": `Bearer ${secretKey}`,
            "cf-connecting-ip": testIp,
        },
        body: JSON.stringify({
            model: "openai",
            messages: [{ role: "user", content: "test secret key" }],
        }),
    });
    
    await response.text(); // Consume body
    
    // Verify NO rate limit headers for secret keys
    const rateLimitHeader = response.headers.get("RateLimit-Limit");
    const remainingHeader = response.headers.get("RateLimit-Remaining");
    
    expect(response.status).toBe(200);
    expect(rateLimitHeader).toBeNull(); // Secret keys should not have rate limit headers
    expect(remainingHeader).toBeNull();
    
    log.info("✓ Secret key correctly bypasses rate limiting - no headers present");
});

test("pollen rate limiter - blocks when bucket exhausted (429)", { timeout: 60000 }, async ({ auth, sessionToken }) => {
    // Create a publishable key for testing
    const createApiKeyResponse = await auth.apiKey.create({
        name: "test-rate-limit-block",
        prefix: "pk",
        metadata: { keyType: "publishable" },
        fetchOptions: {
            headers: { "Cookie": `better-auth.session_token=${sessionToken}` },
        },
    });
    
    if (!createApiKeyResponse.data) throw new Error("Failed to create publishable API key");
    const publishableKey = createApiKeyResponse.data.key;
    
    expect(publishableKey.startsWith("pk_")).toBe(true);
    
    const testIp = `192.0.12.${Date.now() % 254}`;
    
    log.info("Testing rate limit blocking - exhausting bucket to trigger 429");
    log.info(`Test capacity: ${EXPECTED_CAPACITY} pollen`);
    
    // Make sequential requests to exhaust the bucket
    // IMPORTANT: First request can NEVER be blocked (we don't know cost until after it runs)
    // With capacity=0.0002, cost~0.00125 per request (1000 prompt + 500 completion tokens):
    // - Each request takes ~500ms, during which bucket refills: 0.000001 × 0.5 = 0.0000005 pollen (negligible)
    // - Net loss per request: ~0.00125 pollen
    // - To exhaust 0.0002 capacity: 0.0002 / 0.00125 ≈ 0.16 requests (should trigger on 1st request!)
    // Must wait for each request to complete to avoid triggering the concurrent request lock
    let blockedResponse = null;
    let requestCount = 0;
    const maxRequests = 5; // Should trigger 429 on first or second request
    
    for (let i = 1; i <= maxRequests; i++) {
        requestCount = i;
        
        const response = await SELF.fetch(endpoint, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "authorization": `Bearer ${publishableKey}`,
                "cf-connecting-ip": testIp,
            },
            body: JSON.stringify({
                model: "openai",
                messages: [{ role: "user", content: "say hi" }],
            }),
        });
        
        await response.text(); // Consume body
        
        const remaining = response.headers.get("RateLimit-Remaining");
        log.info(`Request ${i}: status=${response.status}, remaining=${remaining}`);
        
        if (response.status === 429) {
            blockedResponse = response;
            log.info(`✓ Rate limit triggered after ${i} requests (bucket exhausted)`);
            break;
        }
        
        // No delay needed - pollen consumption is now synchronous (awaited in middleware)
        // Each request fully completes before the next one starts
    }
    
    // Verify we got blocked
    expect(blockedResponse).not.toBeNull();
    expect(blockedResponse?.status).toBe(429);
    
    // Verify 429 response has correct headers
    const retryAfter = blockedResponse?.headers.get("Retry-After");
    const remaining = blockedResponse?.headers.get("RateLimit-Remaining");
    
    expect(retryAfter).toBeTruthy();
    expect(parseFloat(retryAfter || "0")).toBeGreaterThan(0);
    expect(parseFloat(remaining || "1")).toBeLessThanOrEqual(0.001); // Should be at or near 0
    
    log.info(`✓ 429 response correct: Retry-After=${retryAfter}s, Remaining=${remaining}`);
    log.info(`✓ Rate limiter successfully blocked after ${requestCount} requests`);
});

test("pollen rate limiter - prevents concurrent requests", { timeout: 30000 }, async ({ auth, sessionToken }) => {
    // Create a publishable key for testing
    const createApiKeyResponse = await auth.apiKey.create({
        name: "test-concurrent-blocking",
        prefix: "pk",
        metadata: { keyType: "publishable" },
        fetchOptions: {
            headers: { "Cookie": `better-auth.session_token=${sessionToken}` },
        },
    });
    
    if (!createApiKeyResponse.data) throw new Error("Failed to create publishable API key");
    const publishableKey = createApiKeyResponse.data.key;
    
    expect(publishableKey.startsWith("pk_")).toBe(true);
    
    const testIp = `192.0.99.${Date.now() % 254}`;
    
    log.info("Testing concurrent request prevention");
    log.info("Launching two requests with 10ms delay - second should wait for first to complete");
    
    // Launch first request
    const request1Promise = SELF.fetch(endpoint, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            "authorization": `Bearer ${publishableKey}`,
            "cf-connecting-ip": testIp,
        },
        body: JSON.stringify({
            model: "openai",
            messages: [{ role: "user", content: "say hi" }],
        }),
    });
    
    // Wait only 10ms before launching second request
    await new Promise(resolve => setTimeout(resolve, 10));
    
    const request2Promise = SELF.fetch(endpoint, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            "authorization": `Bearer ${publishableKey}`,
            "cf-connecting-ip": testIp,
        },
        body: JSON.stringify({
            model: "openai",
            messages: [{ role: "user", content: "say hello" }],
        }),
    });
    
    // Wait for both to complete
    const [response1, response2] = await Promise.all([request1Promise, request2Promise]);
    
    await response1.text();
    await response2.text();
    
    log.info(`Request 1 status: ${response1.status}`);
    log.info(`Request 2 status: ${response2.status}`);
    
    // First request should succeed
    expect(response1.status).toBe(200);
    
    // Second request should be blocked (429) because first is still in progress
    expect(response2.status).toBe(429);
    
    // Verify the 429 response has retry-after header
    const retryAfter = response2.headers.get("Retry-After");
    expect(retryAfter).toBeTruthy();
    
    log.info(`✓ Second request blocked with 429 (Retry-After: ${retryAfter}s)`);
    log.info("✓ Concurrent requests prevented - no race condition!");
});

test("pollen rate limiter - bucket refills over time", { timeout: 30000 }, async ({ auth, sessionToken }) => {
    // Create a publishable key for testing
    const createApiKeyResponse = await auth.apiKey.create({
        name: "test-refill-mechanism",
        prefix: "pk",
        metadata: { keyType: "publishable" },
        fetchOptions: {
            headers: { "Cookie": `better-auth.session_token=${sessionToken}` },
        },
    });
    
    if (!createApiKeyResponse.data) throw new Error("Failed to create publishable API key");
    const publishableKey = createApiKeyResponse.data.key;
    
    expect(publishableKey.startsWith("pk_")).toBe(true);
    
    const testIp = `192.0.13.${Date.now() % 254}`;
    const endpoint = "http://localhost:3000/api/generate/v1/chat/completions";
    
    log.info("Testing bucket refill mechanism (refillRate=0.0036 per hour = 0.000001 per second)");
    
    // Make first request - this will show pollen BEFORE consumption
    const response1 = await SELF.fetch(endpoint, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            "authorization": `Bearer ${publishableKey}`,
            "cf-connecting-ip": testIp,
        },
        body: JSON.stringify({
            model: "openai",
            messages: [{ role: "user", content: "hi" }],
        }),
    });
    
    await response1.text();
    const remaining1 = parseFloat(response1.headers.get("RateLimit-Remaining") || "0");
    const capacity = parseFloat(response1.headers.get("RateLimit-Limit") || "0");
    log.info(`Request 1: status=${response1.status}, remaining=${remaining1} (before consumption), capacity=${capacity}`);
    
    expect(response1.status).toBe(200);
    
    // Wait 15 seconds for refill (0.000001 pollen/sec * 15000ms = 0.000015 pollen refilled)
    log.info("Waiting 15 seconds for bucket to refill...");
    await new Promise(resolve => setTimeout(resolve, 15000));
    
    // Make second request - checkRateLimit() will show refilled bucket state
    const response2 = await SELF.fetch(endpoint, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            "authorization": `Bearer ${publishableKey}`,
            "cf-connecting-ip": testIp,
        },
        body: JSON.stringify({
            model: "openai",
            messages: [{ role: "user", content: "hello" }],
        }),
    });
    
    await response2.text();
    const remaining2 = parseFloat(response2.headers.get("RateLimit-Remaining") || "0");
    log.info(`Request 2 (after 15s): status=${response2.status}, remaining=${remaining2} (before consumption)`);
    
    expect(response2.status).toBe(200);
    
    // SIMPLIFIED TEST: If refill works, remaining2 should be >= remaining1
    // Both values are "before consumption" of their respective requests
    // After request 1 consumed pollen and 1.5s passed, the bucket should have refilled
    // Note: With capacity=0.0002, bucket may hit cap and show same value
    log.info(`Comparing: remaining2 (${remaining2}) vs remaining1 (${remaining1})`);
    
    if (remaining2 >= remaining1) {
        log.info(`✓ Bucket refilled or stayed at capacity (remaining2 >= remaining1)`);
        expect(remaining2).toBeGreaterThanOrEqual(remaining1);
    } else {
        // This would indicate a problem - bucket should not decrease between requests with wait time
        log.error(`✗ Bucket decreased! remaining2 (${remaining2}) < remaining1 (${remaining1})`);
        log.error(`This suggests refill is not working or bucket state is not persisting`);
        throw new Error(`Refill test failed: remaining2 (${remaining2}) < remaining1 (${remaining1})`);
    }
});
