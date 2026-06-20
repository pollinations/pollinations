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
        expect(Object.keys(data).sort()).toEqual(
            ["email", "githubUsername", "image", "name"].sort(),
        );
        expect(data).toHaveProperty("githubUsername");
        expect(data).toHaveProperty("image");
        expect(data).toHaveProperty("name");
        expect(data).toHaveProperty("email");
    });

    test("api key without profile scope returns githubUsername and image only", async ({
        sessionToken,
    }) => {
        const createResult = await SELF.fetch(
            "http://localhost:3000/api/account/keys",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Cookie: `better-auth.session_token=${sessionToken}`,
                },
                body: JSON.stringify({ name: "profile-limited-key" }),
            },
        );
        expect(createResult.status).toBe(200);
        const created = (await createResult.json()) as { key: string };

        const response = await SELF.fetch(
            "http://localhost:3000/api/account/profile",
            { headers: { Authorization: `Bearer ${created.key}` } },
        );

        expect(response.status).toBe(200);
        const data = (await response.json()) as Record<string, unknown>;
        expect(Object.keys(data).sort()).toEqual(
            ["githubUsername", "image"].sort(),
        );
        expect(data).toHaveProperty("githubUsername");
        expect(data).toHaveProperty("image");
    });

    test("api key with profile scope also returns name + email", async ({
        sessionToken,
    }) => {
        const createResult = await SELF.fetch(
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
        expect(createResult.status).toBe(200);
        const created = (await createResult.json()) as { key: string };

        const response = await SELF.fetch(
            "http://localhost:3000/api/account/profile",
            {
                headers: {
                    Authorization: `Bearer ${created.key}`,
                },
            },
        );

        expect(response.status).toBe(200);
        const data = (await response.json()) as Record<string, unknown>;
        expect(Object.keys(data).sort()).toEqual(
            ["email", "githubUsername", "image", "name"].sort(),
        );
        expect(data).toHaveProperty("githubUsername");
        expect(data).toHaveProperty("image");
        expect(data).toHaveProperty("name");
        expect(data).toHaveProperty("email");
    });
});
