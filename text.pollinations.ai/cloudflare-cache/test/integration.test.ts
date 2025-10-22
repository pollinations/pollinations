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

	test("streaming responses ARE cached", async () => {
		const url = "http://localhost:8888/v1/chat/completions";
		const body = JSON.stringify({
			model: "openai",
			messages: [{ role: "user", content: "Hello streaming cached" }],
			stream: true, // Request streaming response
		});

		// First streaming request - should be MISS
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
		expect(responseA.status).toBe(200);

		// Should be streaming response
		const contentType = responseA.headers.get("content-type");
		expect(contentType).toContain("text/event-stream");

		// Should be MISS (first time)
		expectCacheHeaders(responseA, {
			cache: "MISS",
			cacheType: null,
		});

		// Consume the stream
		await responseA.text();

		// Wait for caching to complete
		await waitOnExecutionContext(ctx);

		// Second identical streaming request - should be HIT (cached!)
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

		// Should be HIT (streaming responses ARE cached now!)
		expectCacheHeaders(responseB, {
			cache: "HIT",
			cacheType: "EXACT",
		});

		await responseB.text();
	}, 120000);

	test("non-streaming responses are cached", async () => {
		const url = "http://localhost:8888/v1/chat/completions";
		const body = JSON.stringify({
			model: "openai",
			messages: [{ role: "user", content: "Hello non-streaming" }],
			stream: false, // Explicitly request non-streaming
		});

		// First non-streaming request - should be MISS
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

		// Should NOT be streaming
		const contentType = responseA.headers.get("content-type");
		expect(contentType).not.toContain("text/event-stream");

		// Should be MISS
		expectCacheHeaders(responseA, {
			cache: "MISS",
			cacheType: null,
		});

		await responseA.text();

		// Second identical non-streaming request - should be HIT (cached)
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

		// Should be HIT (non-streaming responses are cached)
		expectCacheHeaders(responseB, {
			cache: "HIT",
			cacheType: "EXACT",
		});

		await responseB.text();
	}, 120000);
});
