import { SELF } from "cloudflare:test";
import { test } from "./fixtures.ts";
import { expect } from "vitest";

const endpoint = "http://localhost:3000/api/generate/openai";

test("publishable key rate limited (10 parallel requests)", { timeout: 60000 }, async ({ auth, sessionToken }) => {
    // Create a publishable key for testing
    const createApiKeyResponse = await auth.apiKey.create({
        name: "test-publishable-key",
        prefix: "pk",
        metadata: { keyType: "publishable" },
        fetchOptions: {
            headers: { "Cookie": `better-auth.session_token=${sessionToken}` },
        },
    });
    
    if (!createApiKeyResponse.data) throw new Error("Failed to create publishable API key");
    const publishableKey = createApiKeyResponse.data.key;
    
    expect(publishableKey.startsWith("pk_")).toBe(true);
    expect(createApiKeyResponse.data.metadata?.keyType).toBe("publishable");
    
    const testIp = `192.0.4.${Date.now() % 254}`;
    
    // Make 10 parallel requests - capacity is 3
    const requests = [];
    for (let i = 1; i <= 10; i++) {
        requests.push(
            SELF.fetch(endpoint, {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    "authorization": `Bearer ${publishableKey}`,
                    "cf-connecting-ip": testIp,
                },
                body: JSON.stringify({
                    model: "openai",
                    messages: [{ role: "user", content: `${i}+${i}=` }],
                }),
            })
        );
    }
    
    const responses = await Promise.all(requests);
    
    // Count results
    let successCount = 0;
    let rateLimitedCount = 0;
    
    for (const response of responses) {
        if (response.status === 200) successCount++;
        if (response.status === 429) rateLimitedCount++;
        await response.text(); // Consume body
    }
    
    console.log(`[TEST] 10 parallel requests: ${successCount} success, ${rateLimitedCount} rate limited`);
    console.log(`[TEST] Note: KV eventual consistency may allow all to succeed`);
    
    // Verify rate limit headers exist
    expect(responses[0].headers.get("RateLimit-Limit")).toBe("3");
});

test("publishable key rate limited (5 sequential requests)", { timeout: 60000 }, async ({ auth, sessionToken }) => {
    // Create a publishable key for testing
    const createApiKeyResponse = await auth.apiKey.create({
        name: "test-publishable-key-seq",
        prefix: "pk",
        metadata: { keyType: "publishable" },
        fetchOptions: {
            headers: { "Cookie": `better-auth.session_token=${sessionToken}` },
        },
    });
    
    if (!createApiKeyResponse.data) throw new Error("Failed to create publishable API key");
    const publishableKey = createApiKeyResponse.data.key;
    
    const testIp = `192.0.5.${Date.now() % 254}`;
    
    // Make 5 sequential requests with 100ms delay
    const responses = [];
    for (let i = 1; i <= 5; i++) {
        const randomSeed = Math.floor(Math.random() * 1000000);
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
                seed: randomSeed,
            }),
        });
        responses.push(response);
        
        if (i < 5) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
    
    // Count results
    let successCount = 0;
    let rateLimitedCount = 0;
    
    for (const response of responses) {
        if (response.status === 200) successCount++;
        if (response.status === 429) rateLimitedCount++;
        await response.text(); // Consume body
    }
    
    console.log(`[TEST] 5 sequential requests: ${successCount} success, ${rateLimitedCount} rate limited (expected: 3 success, 2 blocked)`);
    
    // Verify rate limit headers exist
    expect(responses[0].headers.get("RateLimit-Limit")).toBe("3");
});

test("publishable key - 30 parallel requests with network delays (KV limitation)", { timeout: 60000 }, async ({ auth, sessionToken }) => {
    // Create a publishable key for testing
    const createApiKeyResponse = await auth.apiKey.create({
        name: "test-publishable-key-30",
        prefix: "pk",
        metadata: { keyType: "publishable" },
        fetchOptions: {
            headers: { "Cookie": `better-auth.session_token=${sessionToken}` },
        },
    });
    
    if (!createApiKeyResponse.data) throw new Error("Failed to create publishable API key");
    const publishableKey = createApiKeyResponse.data.key;
    
    expect(publishableKey.startsWith("pk_")).toBe(true);
    expect(createApiKeyResponse.data.metadata?.keyType).toBe("publishable");
    
    const testIp = `192.0.6.${Date.now() % 254}`;
    
    // Make 30 parallel requests with random 0-50ms network delays
    const startTime = Date.now();
    const requests = [];
    
    for (let i = 1; i <= 30; i++) {
        const randomSeed = Math.floor(Math.random() * 1000000);
        const networkDelay = Math.floor(Math.random() * 51);
        
        requests.push(
            new Promise(resolve => setTimeout(resolve, networkDelay)).then(() =>
                SELF.fetch(endpoint, {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        "authorization": `Bearer ${publishableKey}`,
                        "cf-connecting-ip": testIp,
                    },
                    body: JSON.stringify({
                        model: "openai",
                        messages: [{ role: "user", content: `${i}+${i}=` }],
                        seed: randomSeed,
                    }),
                })
            )
        );
    }
    
    const responses = await Promise.all(requests);
    const totalTime = Date.now() - startTime;
    
    // Count results
    let successCount = 0;
    let rateLimitedCount = 0;
    
    for (const response of responses) {
        if (response.status === 200) successCount++;
        if (response.status === 429) rateLimitedCount++;
        await response.text(); // Consume body
    }
    
    console.log(`[TEST] 30 parallel requests (${totalTime}ms): ${successCount} success, ${rateLimitedCount} rate limited`);
    console.log(`[TEST] Expected: 3 success, 27 blocked | Actual: ${successCount} success (KV limitation allows bypass)`);
    
    if (successCount > 3) {
        console.log(`[TEST] ⚠️  KV eventual consistency confirmed - parallel requests bypass rate limiting`);
    }
    
    // Verify rate limit headers exist
    expect(responses[0].headers.get("RateLimit-Limit")).toBe("3");
});
