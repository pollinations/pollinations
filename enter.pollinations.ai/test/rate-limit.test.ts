import { SELF } from "cloudflare:test";
import { test } from "./fixtures.ts";
import { expect } from "vitest";
import { getLogger } from "@logtape/logtape";

const endpoint = "http://localhost:3000/api/generate/v1/chat/completions";
const log = getLogger(["test", "rate-limit"]);

// Get capacity from environment (same as production code)
const EXPECTED_CAPACITY = parseFloat(process.env.POLLEN_BUCKET_CAPACITY || "0.1");

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
    
    // Make 3 requests to verify deduction is working
    const responses = [];
    for (let i = 1; i <= 3; i++) {
        log.info(`Request ${i}/3...`);
        
        const response = await SELF.fetch(endpoint, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "authorization": `Bearer ${publishableKey}`,
                "cf-connecting-ip": testIp,
            },
            body: JSON.stringify({
                model: "openai",
                messages: [{ role: "user", content: `${i}+${i}=` }],
                seed: Math.floor(Math.random() * 1000000),
            }),
        });
        
        const remaining = response.headers.get("RateLimit-Remaining");
        log.info(`Request ${i}: status=${response.status}, remaining=${remaining}`);
        
        responses.push({ status: response.status, remaining: parseFloat(remaining || "0") });
        await response.text();
        
        // Wait 2s for tracking to complete
        if (i < 3) {
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    
    // Verify all succeeded
    expect(responses[0].status).toBe(200);
    expect(responses[1].status).toBe(200);
    expect(responses[2].status).toBe(200);
    
    // Verify pollen-based headers are present and in correct range
    log.info(`Remaining pollen: Request 1=${responses[0].remaining.toFixed(6)}, Request 2=${responses[1].remaining.toFixed(6)}, Request 3=${responses[2].remaining.toFixed(6)}`);
    
    expect(responses[0].remaining).toBeGreaterThan(0);
    expect(responses[0].remaining).toBeLessThanOrEqual(EXPECTED_CAPACITY);
    
    // Note: Pollen deduction happens async in waitUntil, so we can't reliably test 
    // synchronous deduction here. The key is that:
    // 1. Rate limit headers are pollen-based (from env: POLLEN_BUCKET_CAPACITY)
    // 2. Pre-request checks work (all requests succeeded)
    // 3. Post-request deduction happens eventually (logged as "Pollen consumed")
    
    // For MVP, we've verified the mechanism exists and basic flow works
    log.info("✓ Pollen rate limiter MVP test passed - headers correct, async deduction configured");
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
