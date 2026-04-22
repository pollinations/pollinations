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
        expect(data).toHaveProperty("name");
        expect(data).toHaveProperty("email");
    });

    test("api key without profile scope returns only githubUsername + image", async ({
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
        expect(data).not.toHaveProperty("name");
        expect(data).not.toHaveProperty("email");
    });

    test("api key with profile scope also returns name + email", async ({
        auth,
        sessionToken,
    }) => {
        const createResult = await auth.apiKey.create({
            name: "profile-scoped-key",
            fetchOptions: {
                headers: {
                    Cookie: `better-auth.session_token=${sessionToken}`,
                },
            },
        });
        if (!createResult.data) throw new Error("Failed to create key");

        const updateRes = await SELF.fetch(
            `http://localhost:3000/api/api-keys/${createResult.data.id}/update`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: `better-auth.session_token=${sessionToken}`,
                },
                body: JSON.stringify({
                    accountPermissions: ["profile"],
                }),
            },
        );
        if (!updateRes.ok) {
            throw new Error(
                `Failed to set permissions: ${await updateRes.text()}`,
            );
        }

        const response = await SELF.fetch(
            "http://localhost:3000/api/account/profile",
            {
                headers: {
                    Authorization: `Bearer ${createResult.data.key}`,
                },
            },
        );

        expect(response.status).toBe(200);
        const data = (await response.json()) as Record<string, unknown>;
        expect(data).toHaveProperty("githubUsername");
        expect(data).toHaveProperty("image");
        expect(data).toHaveProperty("name");
        expect(data).toHaveProperty("email");
    });
});
