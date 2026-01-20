import { SELF } from "cloudflare:test";
import { expect } from "vitest";
import { test } from "../fixtures.ts";

// Test account endpoints from PR #7355
// Verify /account/profile, /account/balance, /account/usage

test("GET /account/profile returns nextResetAt field", async ({
	mocks,
	sessionToken,
}) => {
	await mocks.enable("polar", "tinybird");

	const response = await SELF.fetch(
		`http://localhost:3000/api/account/profile`,
		{
			method: "GET",
			headers: {
				Cookie: `better-auth.session_token=${sessionToken}`,
			},
		},
	);

	expect(response.status).toBe(200);

	const data = (await response.json()) as {
		name: string | null;
		email: string | null;
		githubUsername: string | null;
		tier: string;
		createdAt: string;
		nextResetAt: string | null;
	};

	expect(data).toHaveProperty("nextResetAt");
	// nextResetAt should be null or ISO datetime
	if (data.nextResetAt) {
		expect(() => new Date(data.nextResetAt)).not.toThrow();
	}
});

test("GET /account/profile returns 403 without account:profile permission", async ({
	mocks,
	auth,
	sessionToken,
}) => {
	await mocks.enable("polar", "tinybird");

	// Create API key without account permissions
	const createApiKeyResponse = await auth.apiKey.create({
		name: "no-account-perms",
		fetchOptions: {
			headers: {
				Cookie: `better-auth.session_token=${sessionToken}`,
			},
		},
	});

	if (!createApiKeyResponse.data) {
		throw new Error("Failed to create API key");
	}

	// Update to remove account permissions (set empty permissions)
	const updateResponse = await SELF.fetch(
		`http://localhost:3000/api/api-keys/${createApiKeyResponse.data.id}/update`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Cookie: `better-auth.session_token=${sessionToken}`,
			},
			body: JSON.stringify({
				permissions: { account: [] },
			}),
		},
	);

	expect(updateResponse.ok).toBe(true);

	const response = await SELF.fetch(
		`http://localhost:3000/api/account/profile`,
		{
			method: "GET",
			headers: {
				Authorization: `Bearer ${createApiKeyResponse.data.key}`,
			},
		},
	);

	expect(response.status).toBe(403);

	const data = (await response.json()) as {
		success: boolean;
		error: { message: string };
	};
	expect(data.success).toBe(false);
	expect(data.error.message).toContain("account:profile");
});

test("GET /account/balance returns API key budget when set", async ({
	mocks,
	budgetedApiKey,
}) => {
	await mocks.enable("polar", "tinybird");

	const response = await SELF.fetch(
		`http://localhost:3000/api/account/balance`,
		{
			method: "GET",
			headers: {
				Authorization: `Bearer ${budgetedApiKey.key}`,
			},
		},
	);

	expect(response.status).toBe(200);

	const data = (await response.json()) as { balance: number };
	expect(data.balance).toBe(100); // Set in fixture
});

test("GET /account/usage returns usage records", async ({
	mocks,
	sessionToken,
}) => {
	await mocks.enable("polar", "tinybird");

	const response = await SELF.fetch(
		`http://localhost:3000/api/account/usage?limit=10`,
		{
			method: "GET",
			headers: {
				Cookie: `better-auth.session_token=${sessionToken}`,
			},
		},
	);

	expect(response.status).toBe(200);

	const data = (await response.json()) as {
		usage: Array<{
			timestamp: string;
			type: string;
			model: string | null;
			cost_usd: number;
		}>;
		count: number;
	};

	expect(Array.isArray(data.usage)).toBe(true);
	expect(data.count).toBeGreaterThanOrEqual(0);
});

test("GET /account/usage/daily returns CSV format", async ({
	mocks,
	sessionToken,
}) => {
	await mocks.enable("polar", "tinybird");

	const response = await SELF.fetch(
		`http://localhost:3000/api/account/usage/daily?format=csv`,
		{
			method: "GET",
			headers: {
				Cookie: `better-auth.session_token=${sessionToken}`,
			},
		},
	);

	expect(response.status).toBe(200);
	expect(response.headers.get("content-type")).toBe("text/csv");

	const csv = await response.text();
	expect(csv).toContain("date,model,meter_source,requests,cost_usd");
});
