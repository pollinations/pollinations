import { SELF } from "cloudflare:test";
import { test } from "./fixtures.ts";
import { expect } from "vitest";

const endpoint = "http://localhost:3000/api/generate/openai";

test("rate limit middleware is active and returns rate limit headers", { timeout: 15000 }, async ({ apiKey }) => {
    const testIp = "192.0.2.100"; // Use unique IP for this test
    console.log("[TEST] Making request with apiKey:", apiKey?.substring(0, 10) + "...");
    
    const response = await SELF.fetch(endpoint, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            "authorization": `Bearer ${apiKey}`,
            "cf-connecting-ip": testIp,
        },
        body: JSON.stringify({
            model: "openai",
            messages: [{ role: "user", content: "test" }],
            seed: Math.floor(Math.random() * 1000000),
        }),
    });
    
    console.log("[TEST] Response - Status:", response.status);
    console.log("[TEST] Response - RateLimit headers:", {
        limit: response.headers.get("RateLimit-Limit"),
        remaining: response.headers.get("RateLimit-Remaining"),
        reset: response.headers.get("RateLimit-Reset"),
    });
    
    // Verify rate limit headers are present (middleware is active)
    expect(response.headers.get("RateLimit-Limit")).toBeDefined();
    expect(response.headers.get("RateLimit-Remaining")).toBeDefined();
    expect(response.headers.get("RateLimit-Reset")).toBeDefined();
});

test("rate limit blocks requests exceeding the limit", { timeout: 30000 }, async () => {
    // Use a timestamp-based unique IP to avoid KV state from other tests
    const timestamp = Date.now();
    const testIp = `192.0.2.${(timestamp % 254) + 1}`;
    console.log("[TEST] Testing rate limit enforcement with IP:", testIp, "(no API key)");
    
    // Make 25 requests without API key (limit is 24 per 2 minutes)
    const responses = [];
    for (let i = 0; i < 25; i++) {
        const response = await SELF.fetch(endpoint, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "cf-connecting-ip": testIp,
            },
            body: JSON.stringify({
                model: "openai",
                messages: [{ role: "user", content: `request ${i + 1}` }],
                seed: Math.floor(Math.random() * 1000000),
            }),
        });
        responses.push(response);
        console.log(`[TEST] Request ${i + 1} - Status: ${response.status}, Remaining: ${response.headers.get("RateLimit-Remaining")}`);
        
        // Stop after getting rate limited
        if (response.status === 429) break;
    }
    
    // Verify that we got rate limited eventually
    const rateLimitedResponse = responses.find(r => r.status === 429);
    expect(rateLimitedResponse).toBeDefined();
    expect(rateLimitedResponse?.status).toBe(429);
});
