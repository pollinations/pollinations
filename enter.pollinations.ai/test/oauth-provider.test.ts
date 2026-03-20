import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("OAuth 2.1 Provider", () => {
    const baseUrl = "https://enter.pollinations.ai";

    describe("Well-known endpoints", () => {
        it("should return OAuth Authorization Server metadata", async () => {
            const response = await SELF.fetch(
                `${baseUrl}/.well-known/oauth-authorization-server/api/auth`,
            );
            expect(response.status).toBe(200);
            const data = (await response.json()) as Record<string, unknown>;
            expect(data.issuer).toBeDefined();
            expect(data.authorization_endpoint).toBeDefined();
            expect(data.token_endpoint).toBeDefined();
            expect(data.registration_endpoint).toBeDefined();
        });

        it("should return OpenID Configuration", async () => {
            const response = await SELF.fetch(
                `${baseUrl}/.well-known/openid-configuration/api/auth`,
            );
            expect(response.status).toBe(200);
            const data = (await response.json()) as Record<string, unknown>;
            expect(data.issuer).toBeDefined();
            expect(data.jwks_uri).toBeDefined();
            expect(data.authorization_endpoint).toBeDefined();
            expect(data.token_endpoint).toBeDefined();
        });
    });

    describe("JWKS endpoint", () => {
        it("should return JWKS at /api/auth/jwks", async () => {
            const response = await SELF.fetch(`${baseUrl}/api/auth/jwks`);
            expect(response.status).toBe(200);
            const data = (await response.json()) as { keys: unknown[] };
            expect(data.keys).toBeDefined();
            expect(Array.isArray(data.keys)).toBe(true);
        });
    });

    describe("Dynamic client registration", () => {
        it("should allow unauthenticated client registration", async () => {
            const response = await SELF.fetch(
                `${baseUrl}/api/auth/oauth2/register`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        client_name: "Test OAuth Client",
                        redirect_uris: ["https://example.com/callback"],
                    }),
                },
            );
            expect(response.status).toBe(200);
            const data = (await response.json()) as Record<string, unknown>;
            expect(data.client_id).toBeDefined();
            expect(data.redirect_uris).toBeDefined();
        });
    });
});
