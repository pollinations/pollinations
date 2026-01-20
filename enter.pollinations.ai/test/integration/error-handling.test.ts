import { SELF } from "cloudflare:test";
import { expect } from "vitest";
import { test } from "../fixtures.ts";

// Test error status codes from PR #7499
// Verify 402 (Payment Required) and 403 (Forbidden) error handling

test("Returns 402 when API key budget is exhausted", async ({
	mocks,
	exhaustedBudgetApiKey,
}) => {
	await mocks.enable("polar", "tinybird", "vcr");

	const response = await SELF.fetch(
		`http://localhost:3000/api/generate/v1/chat/completions`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Authorization": `Bearer ${exhaustedBudgetApiKey}`,
			},
			body: JSON.stringify({
				model: "openai",
				messages: [{ role: "user", content: "test" }],
			}),
		},
	);

	expect(response.status).toBe(402);

	const data = (await response.json()) as {
		success: boolean;
		error: { code: string; message: string };
	};
	expect(data.success).toBe(false);
	expect(data.error.code).toBe("PAYMENT_REQUIRED");
	expect(data.error.message).toContain("budget");
});

test("Returns 403 when API key lacks model permissions", async ({
	mocks,
	restrictedApiKey,
}) => {
	await mocks.enable("polar", "tinybird", "vcr");

	// Try to use a model not in allowedModels ["openai-fast", "flux"]
	const response = await SELF.fetch(
		`http://localhost:3000/api/generate/v1/chat/completions`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Authorization": `Bearer ${restrictedApiKey}`,
			},
			body: JSON.stringify({
				model: "mistral",
				messages: [{ role: "user", content: "test" }],
			}),
		},
	);

	expect(response.status).toBe(403);

	const data = (await response.json()) as {
		success: boolean;
		error: { code: string; message: string };
	};
	expect(data.success).toBe(false);
	expect(data.error.code).toBe("FORBIDDEN");
	expect(data.error.message).toContain("not allowed");
});

test("Error response includes timestamp and proper structure", async ({
	mocks,
	exhaustedBudgetApiKey,
}) => {
	await mocks.enable("polar", "tinybird", "vcr");

	const response = await SELF.fetch(
		`http://localhost:3000/api/generate/v1/chat/completions`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Authorization": `Bearer ${exhaustedBudgetApiKey}`,
			},
			body: JSON.stringify({
				model: "openai",
				messages: [{ role: "user", content: "test" }],
			}),
		},
	);

	const data = (await response.json()) as {
		status: number;
		success: boolean;
		error: {
			code: string;
			message: string;
			timestamp: string;
		};
	};

	expect(data.status).toBe(402);
	expect(data.success).toBe(false);
	expect(data.error.timestamp).toBeTruthy();
	// Verify timestamp is ISO format
	expect(() => new Date(data.error.timestamp)).not.toThrow();
});
