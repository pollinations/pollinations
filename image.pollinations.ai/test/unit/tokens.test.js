import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { extractToken, isValidToken } from "../../src/config/tokens.js";

describe("Token Authentication", () => {
	const originalEnv = process.env;

	beforeEach(() => {
		process.env = {
			...originalEnv,
			VALID_TOKENS:
				"test-token:Test Customer:Test description,another-token:Another:Another desc",
		};
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	describe("isValidToken", () => {
		it("should validate known tokens", () => {
			expect(isValidToken("test-token")).toBe(true);
			expect(isValidToken("another-token")).toBe(true);
		});

		it("should reject invalid tokens", () => {
			expect(isValidToken("invalid-token")).toBe(false);
			expect(isValidToken("")).toBe(false);
			expect(isValidToken(null)).toBe(false);
			expect(isValidToken(undefined)).toBe(false);
		});
	});

	describe("extractToken", () => {
		it("should extract token from query parameters", () => {
			const req = {
				url: "/prompt/test?token=test-token",
				headers: {},
			};
			expect(extractToken(req)).toBe("test-token");
		});

		it("should extract token from Authorization header", () => {
			const req = {
				url: "/prompt/test",
				headers: {
					authorization: "Bearer test-token",
				},
			};
			expect(extractToken(req)).toBe("test-token");
		});

		it("should return null when no token is present", () => {
			const req = {
				url: "/prompt/test",
				headers: {},
			};
			expect(extractToken(req)).toBe(null);
		});
	});
});
