import { SELF } from "cloudflare:test";
import { describe, expect } from "vitest";
import { test } from "../fixtures.ts";

describe("GET /api/account/profile", () => {
    test("session auth returns githubUsername, image, name, email", async ({
        sessionToken,
    }) => {
        const response = await SELF.fetch(
            "http://localhost:3000/api/account/profile",
            {
                headers: {
                    Cookie: `better-auth.session_token=${sessionToken}`,
                },
            },
        );

        expect(response.status).toBe(200);
        const data = (await response.json()) as Record<string, unknown>;
        expect(data).toHaveProperty("githubUsername");
        expect(data).toHaveProperty("image");
        expect(data).not.toHaveProperty("tier");
        expect(data).not.toHaveProperty("nextResetAt");
        expect(data.communityEndpointsAllowed).toBe(false);
        expect(data).toHaveProperty("name");
        expect(data).toHaveProperty("email");
    });

    test("api key without profile scope returns githubUsername and image (no name/email)", async ({
        apiKey,
    }) => {
        const response = await SELF.fetch(
            "http://localhost:3000/api/account/profile",
            { headers: { Authorization: `Bearer ${apiKey}` } },
        );

        expect(response.status).toBe(200);
        const data = (await response.json()) as Record<string, unknown>;
        expect(data).toHaveProperty("githubUsername");
        expect(data).toHaveProperty("image");
        expect(data).not.toHaveProperty("tier");
        expect(data).not.toHaveProperty("nextResetAt");
        expect(data.communityEndpointsAllowed).toBe(false);
        expect(data).not.toHaveProperty("name");
        expect(data).not.toHaveProperty("email");
    });

    test("api key with profile scope also returns name + email", async ({
        sessionToken,
    }) => {
        const createResponse = await SELF.fetch(
            "http://localhost:3000/api/account/keys",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: `better-auth.session_token=${sessionToken}`,
                },
                body: JSON.stringify({
                    name: "profile-scoped-key",
                    accountPermissions: ["profile"],
                }),
            },
        );
        if (!createResponse.ok) {
            throw new Error(
                `Failed to create key: ${await createResponse.text()}`,
            );
        }
        const createResult = (await createResponse.json()) as { key: string };

        const response = await SELF.fetch(
            "http://localhost:3000/api/account/profile",
            {
                headers: {
                    Authorization: `Bearer ${createResult.key}`,
                },
            },
        );

        expect(response.status).toBe(200);
        const data = (await response.json()) as Record<string, unknown>;
        expect(data).toHaveProperty("githubUsername");
        expect(data).toHaveProperty("image");
        expect(data).not.toHaveProperty("tier");
        expect(data).not.toHaveProperty("nextResetAt");
        expect(data.communityEndpointsAllowed).toBe(false);
        expect(data).toHaveProperty("name");
        expect(data).toHaveProperty("email");
    });
});
