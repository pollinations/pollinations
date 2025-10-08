import {
	createExecutionContext,
	env,
	waitOnExecutionContext,
} from "cloudflare:test";
import { test, describe, expect, vi } from "vitest";
import worker from "../src";

// Test token - loaded from wrangler.toml test environment vars
const TEST_TOKEN = "mttnGApCZjFxVZNg";

type CacheHeaders = {
	cache: "HIT" | "MISS";
	cacheType?: "EXACT" | "SEMANTIC" | null;
};

function expectCacheHeaders(response: Response, expectedHeaders: CacheHeaders) {
	const xCache = response.headers.get("X-Cache");
	expect(xCache).toBe(expectedHeaders.cache);
	
	if (expectedHeaders.cacheType !== undefined) {
		const xCacheType = response.headers.get("X-Cache-Type");
		expect(xCacheType).toBe(expectedHeaders.cacheType);
	}
}

describe("Cache Integration Tests", () => {
	test("identical GET requests produce exact cache hit", async () => {
		const url = "http://localhost:8888/v1/chat/completions";
		const body = JSON.stringify({
			model: "openai",
			messages: [{ role: "user", content: "Hello" }],
		});

		// First request - should be MISS
		let ctx = createExecutionContext();
		const responseA = await worker.fetch(
			new Request(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Authorization": `Bearer ${TEST_TOKEN}`,
				},
				body,
			}),
			env,
			ctx,
		);
		await waitOnExecutionContext(ctx);
		expect(responseA.status).toBe(200);
		await responseA.text(); // Consume body

		expectCacheHeaders(responseA, {
			cache: "MISS",
			cacheType: null,
		});

		// Second identical request - should be HIT
		ctx = createExecutionContext();
		const responseB = await worker.fetch(
			new Request(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Authorization": `Bearer ${TEST_TOKEN}`,
				},
				body,
			}),
			env,
			ctx,
		);
		await waitOnExecutionContext(ctx);
		expect(responseB.status).toBe(200);
		await responseB.text(); // Consume body

		expectCacheHeaders(responseB, {
			cache: "HIT",
			cacheType: "EXACT",
		});
	}, 120000);

	test("different request bodies produce different cache keys", async () => {
		const url = "http://localhost:8888/v1/chat/completions";
		const bodyA = JSON.stringify({
			model: "openai",
			messages: [{ role: "user", content: "Hello" }],
		});
		const bodyB = JSON.stringify({
			model: "openai",
			messages: [{ role: "user", content: "Goodbye" }],
		});

		// First request with "Hello"
		let ctx = createExecutionContext();
		const responseA = await worker.fetch(
			new Request(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Authorization": `Bearer ${TEST_TOKEN}`,
				},
				body: bodyA,
			}),
			env,
			ctx,
		);
		await waitOnExecutionContext(ctx);
		expect(responseA.status).toBe(200);
		await responseA.text();

		expectCacheHeaders(responseA, {
			cache: "MISS",
			cacheType: null,
		});

		// Second request with "Goodbye" - should also be MISS (different body)
		ctx = createExecutionContext();
		const responseB = await worker.fetch(
			new Request(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Authorization": `Bearer ${TEST_TOKEN}`,
				},
				body: bodyB,
			}),
			env,
			ctx,
		);
		await waitOnExecutionContext(ctx);
		expect(responseB.status).toBe(200);
		await responseB.text();

		expectCacheHeaders(responseB, {
			cache: "MISS",
			cacheType: null,
		});
	}, 120000);

	test("excluded paths bypass cache", async () => {
		const url = "http://localhost:8888/models";

		// First request to excluded path
		let ctx = createExecutionContext();
		const responseA = await worker.fetch(new Request(url), env, ctx);
		await waitOnExecutionContext(ctx);
		expect(responseA.status).toBe(200);
		await responseA.text();

		// Should not have cache headers (bypassed middleware)
		expect(responseA.headers.get("X-Cache")).toBeNull();

		// Second request to same excluded path
		ctx = createExecutionContext();
		const responseB = await worker.fetch(new Request(url), env, ctx);
		await waitOnExecutionContext(ctx);
		expect(responseB.status).toBe(200);
		await responseB.text();

		// Should still not have cache headers
		expect(responseB.headers.get("X-Cache")).toBeNull();
	}, 120000);
});
