import { SELF } from "cloudflare:test";
import { describe, expect, test } from "vitest";

describe("RFC 9728 protected resource metadata", () => {
    test("names enter as the authorization server for its own account API", async () => {
        const response = await SELF.fetch(
            "https://enter.pollinations.ai/.well-known/oauth-protected-resource",
        );

        expect(response.status).toBe(200);
        expect(response.headers.get("Cache-Control")).toBe(
            "public, max-age=3600",
        );
        expect(await response.json()).toEqual({
            resource: "https://enter.pollinations.ai",
            authorization_servers: ["https://enter.pollinations.ai"],
            scopes_supported: [
                "generate",
                "profile",
                "usage",
                "keys",
                "machines",
            ],
            bearer_methods_supported: ["header"],
            resource_name: "Pollinations Account API",
            resource_documentation: "https://gen.pollinations.ai/docs/llm.txt",
        });
    });

    test("keeps staging on its own tier", async () => {
        const response = await SELF.fetch(
            "https://staging.enter.pollinations.ai/.well-known/oauth-protected-resource",
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            resource: "https://staging.enter.pollinations.ai",
            authorization_servers: ["https://staging.enter.pollinations.ai"],
            resource_documentation:
                "https://staging.gen.pollinations.ai/docs/llm.txt",
        });
    });

    test("a 401 points the client at the metadata (RFC 9728 section 5.1)", async () => {
        const response = await SELF.fetch(
            "https://staging.enter.pollinations.ai/api/oauth/userinfo",
        );

        expect(response.status).toBe(401);
        expect(response.headers.get("WWW-Authenticate")).toBe(
            'Bearer resource_metadata="https://staging.enter.pollinations.ai/.well-known/oauth-protected-resource"',
        );
    });
});
