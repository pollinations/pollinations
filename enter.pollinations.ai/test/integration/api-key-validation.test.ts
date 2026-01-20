import { SELF } from "cloudflare:test";
import { expect } from "vitest";
import { test } from "../fixtures.ts";

// Test API key name validation from PR #7438
// Verify min/max length constraints (1-253 chars)

test("Creates API key with 1-character name (minimum)", async ({
	mocks,
	auth,
	sessionToken,
}) => {
	await mocks.enable("polar", "tinybird");

	const response = await auth.apiKey.create({
		name: "x",
		fetchOptions: {
			headers: {
				Cookie: `better-auth.session_token=${sessionToken}`,
			},
		},
	});

	expect(response.data).toBeTruthy();
	expect(response.data?.name).toBe("x");
});

test("Creates API key with short hostname like 'x.ai'", async ({
	mocks,
	auth,
	sessionToken,
}) => {
	await mocks.enable("polar", "tinybird");

	const response = await auth.apiKey.create({
		name: "x.ai",
		fetchOptions: {
			headers: {
				Cookie: `better-auth.session_token=${sessionToken}`,
			},
		},
	});

	expect(response.data).toBeTruthy();
	expect(response.data?.name).toBe("x.ai");
});

test("Creates API key with 253-character name (maximum)", async ({
	mocks,
	auth,
	sessionToken,
}) => {
	await mocks.enable("polar", "tinybird");

	// DNS hostname max length is 253
	const maxLengthName = "a".repeat(253);

	const response = await auth.apiKey.create({
		name: maxLengthName,
		fetchOptions: {
			headers: {
				Cookie: `better-auth.session_token=${sessionToken}`,
			},
		},
	});

	expect(response.data).toBeTruthy();
	expect(response.data?.name).toBe(maxLengthName);
});

test("Rejects API key with name exceeding 253 characters", async ({
	mocks,
	auth,
	sessionToken,
}) => {
	await mocks.enable("polar", "tinybird");

	const tooLongName = "a".repeat(254);

	const response = await auth.apiKey.create({
		name: tooLongName,
		fetchOptions: {
			headers: {
				Cookie: `better-auth.session_token=${sessionToken}`,
			},
		},
	});

	expect(response.error).toBeTruthy();
});

test("Rejects API key with empty name", async ({
	mocks,
	auth,
	sessionToken,
}) => {
	await mocks.enable("polar", "tinybird");

	const response = await auth.apiKey.create({
		name: "",
		fetchOptions: {
			headers: {
				Cookie: `better-auth.session_token=${sessionToken}`,
			},
		},
	});

	expect(response.error).toBeTruthy();
});
