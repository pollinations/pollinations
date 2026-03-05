import { SELF } from "cloudflare:test";
import { describe, expect, test } from "vitest";

/**
 * Auth tests using mock ENTER service binding.
 * See test/mocks/enter-worker.js for available test keys:
 * - sk_test_free       → valid, tier balance only
 * - sk_test_paid       → valid, paid balance (pack + tier)
 * - sk_test_restricted → valid, restricted to ["openai-fast", "flux"]
 * - sk_test_exhausted  → valid, zero balance
 */

describe("Authentication", () => {
	test("valid API key returns 200 for model listing", async () => {
		const response = await SELF.fetch(
			"http://localhost/api/generate/v1/models",
			{
				method: "GET",
				headers: { authorization: "Bearer sk_test_free" },
			},
		);
		expect(response.status).toBe(200);
		const data = (await response.json()) as { data: unknown[] };
		expect(data.data.length).toBeGreaterThan(0);
	});

	test("invalid API key still returns models (auth optional on listing)", async () => {
		const response = await SELF.fetch(
			"http://localhost/api/generate/v1/models",
			{
				method: "GET",
				headers: { authorization: "Bearer sk_invalid_key" },
			},
		);
		expect(response.status).toBe(200);
		await response.text();
	});

	test("no auth returns 401 on generation endpoints", async () => {
		const response = await SELF.fetch(
			"http://localhost/api/generate/v1/chat/completions",
			{
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					model: "openai",
					messages: [{ role: "user", content: "hello" }],
				}),
			},
		);
		expect(response.status).toBe(401);
		await response.text();
	});

	test("invalid API key returns 401 on generation endpoints", async () => {
		const response = await SELF.fetch(
			"http://localhost/api/generate/v1/chat/completions",
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
					authorization: "Bearer sk_invalid_key",
				},
				body: JSON.stringify({
					model: "openai",
					messages: [{ role: "user", content: "hello" }],
				}),
			},
		);
		expect(response.status).toBe(401);
		await response.text();
	});
});

describe("Balance checks", () => {
	test("exhausted balance returns 402", async () => {
		const response = await SELF.fetch(
			"http://localhost/api/generate/image/test-no-balance?model=flux",
			{
				method: "GET",
				headers: { authorization: "Bearer sk_test_exhausted" },
			},
		);
		expect(response.status).toBe(402);
		const text = await response.text();
		expect(text.toLowerCase()).toContain("balance");
	});

	test("free tier key rejected for paid-only models", async () => {
		const modelsResp = await SELF.fetch(
			"http://localhost/api/generate/image/models",
			{ method: "GET" },
		);
		const models = (await modelsResp.json()) as {
			name: string;
			paid_only?: boolean;
		}[];
		const paidModel = models.find((m) => m.paid_only);

		if (!paidModel) {
			return;
		}

		const response = await SELF.fetch(
			`http://localhost/api/generate/image/test?model=${paidModel.name}`,
			{
				method: "GET",
				headers: { authorization: "Bearer sk_test_free" },
			},
		);
		expect(response.status).toBe(402);
		await response.text();
	});

	test.skip(
		"paid key passes auth + balance for paid-only models (needs backend)",
		{ timeout: 10000 },
		async () => {
			// TODO: Requires real image backend or VCR mock — skipped until
			// multi-service integration tests are set up
			const modelsResp = await SELF.fetch(
				"http://localhost/api/generate/image/models",
				{
					method: "GET",
					headers: { authorization: "Bearer sk_test_paid" },
				},
			);
			const models = (await modelsResp.json()) as {
				name: string;
				paid_only?: boolean;
			}[];
			const paidModel = models.find((m) => m.paid_only);

			if (!paidModel) {
				return;
			}

			const response = await SELF.fetch(
				`http://localhost/api/generate/image/test?model=${paidModel.name}`,
				{
					method: "GET",
					headers: { authorization: "Bearer sk_test_paid" },
				},
			);
			expect(response.status).not.toBe(401);
			expect(response.status).not.toBe(402);
			await response.text();
		},
	);
});

describe("API key permissions", () => {
	test("restricted key can access allowed text models", async () => {
		const response = await SELF.fetch(
			"http://localhost/api/generate/v1/models",
			{
				method: "GET",
				headers: { authorization: "Bearer sk_test_restricted" },
			},
		);
		expect(response.status).toBe(200);
		const data = (await response.json()) as { data: { id: string }[] };
		const modelIds = data.data.map((m) => m.id);

		expect(modelIds).toContain("openai-fast");
		expect(modelIds).not.toContain("openai");
		expect(modelIds).not.toContain("mistral");
	});

	test("restricted key filters image models", async () => {
		const response = await SELF.fetch(
			"http://localhost/api/generate/image/models",
			{
				method: "GET",
				headers: { authorization: "Bearer sk_test_restricted" },
			},
		);
		expect(response.status).toBe(200);
		const models = (await response.json()) as { name: string }[];
		const modelNames = models.map((m) => m.name);

		expect(modelNames).toContain("flux");
		expect(modelNames).not.toContain("turbo");
	});

	test("restricted key rejected for disallowed model on generation", async () => {
		// Use "kontext" which is a valid model but not in the restricted list
		const response = await SELF.fetch(
			"http://localhost/api/generate/image/test?model=kontext",
			{
				method: "GET",
				headers: { authorization: "Bearer sk_test_restricted" },
			},
		);
		expect(response.status).toBe(403);
		await response.text();
	});
});
