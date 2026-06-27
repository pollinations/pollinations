import { SELF } from "cloudflare:test";
import { describe, expect } from "vitest";
import { test } from "../fixtures.ts";

describe("GET /api/account/profile", () => {
    test("session auth returns githubUsername, image, tier, nextResetAt, name, email", async ({
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
        expect(data).toHaveProperty("tier");
        expect(data).toHaveProperty("cacheWritesDisabled", false);
        expect(data).toHaveProperty("privacyModeEnabled", false);
        expect(data).toHaveProperty("nextResetAt");
        expect(data).toHaveProperty("name");
        expect(data).toHaveProperty("email");
    });

    test("api key without profile scope returns githubUsername, image, tier, nextResetAt (no name/email)", async ({
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
        expect(data).toHaveProperty("tier");
        expect(data).toHaveProperty("cacheWritesDisabled", false);
        expect(data).toHaveProperty("privacyModeEnabled", false);
        expect(data).toHaveProperty("nextResetAt");
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
        expect(data).toHaveProperty("tier");
        expect(data).toHaveProperty("cacheWritesDisabled", false);
        expect(data).toHaveProperty("privacyModeEnabled", false);
        expect(data).toHaveProperty("nextResetAt");
        expect(data).toHaveProperty("name");
        expect(data).toHaveProperty("email");
    });
});

describe("PATCH /api/account/settings", () => {
    test("session auth updates global generation preferences", async ({
        sessionToken,
    }) => {
        const update = await SELF.fetch(
            "http://localhost:3000/api/account/settings",
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: `better-auth.session_token=${sessionToken}`,
                },
                body: JSON.stringify({
                    cacheWritesDisabled: true,
                    privacyModeEnabled: true,
                }),
            },
        );

        expect(update.status).toBe(200);
        await expect(update.json()).resolves.toMatchObject({
            cacheWritesDisabled: true,
            privacyModeEnabled: true,
        });

        const profile = await SELF.fetch(
            "http://localhost:3000/api/account/profile",
            {
                headers: {
                    Cookie: `better-auth.session_token=${sessionToken}`,
                },
            },
        );

        expect(profile.status).toBe(200);
        await expect(profile.json()).resolves.toMatchObject({
            cacheWritesDisabled: true,
            privacyModeEnabled: true,
        });
    });
});
