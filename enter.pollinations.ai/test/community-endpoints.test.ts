/**
 * Handler-level tests for the community-endpoints route.
 *
 * Step 1 (failing): create handler returns modelId keyed on user.handle, even
 * when user.githubUsername is null.  This drives the requireOwnerHandle migration.
 */
import { env, SELF } from "cloudflare:test";
import * as schema from "@shared/db/better-auth.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { expect } from "vitest";
import { test } from "./fixtures.ts";

const MY_MODELS = "http://localhost:3000/api/account/my-models";

/**
 * Seed the DB so that:
 *  - user.handle = "testuser" (already set by GitHub OAuth signup fixture)
 *  - user.githubUsername = null  (simulates identity-normalization migration)
 *  - account row has an allowed githubId so access check passes
 */
async function seedAllowedUser(db: ReturnType<typeof drizzle<typeof schema>>) {
    const [u] = await db
        .select({ id: schema.user.id })
        .from(schema.user)
        .limit(1);

    // Wipe githubUsername from the user row (handle stays as "testuser").
    await db
        .update(schema.user)
        .set({ githubUsername: null })
        .where(eq(schema.user.id, u.id));

    // Replace the github account row with one that has an allowed github id.
    await db.delete(schema.account).where(eq(schema.account.userId, u.id));
    await db.insert(schema.account).values({
        id: "a-allowed-github",
        accountId: "36901823", // ElliotEtag — on the allowlist
        providerId: "github",
        username: null, // deliberately null to validate we use handle, not account.username
        userId: u.id,
        createdAt: new Date(),
        updatedAt: new Date(),
    });
}

test(
    "POST /my-models returns modelId keyed on handle when githubUsername is null",
    { timeout: 30_000 },
    async ({ sessionToken, mocks }) => {
        await mocks.enable("github", "tinybird");

        const db = drizzle(env.DB, { schema });
        await seedAllowedUser(db);

        const res = await SELF.fetch(MY_MODELS, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Cookie: `better-auth.session_token=${sessionToken}`,
            },
            body: JSON.stringify({
                name: "my-model",
                baseUrl: "https://upstream.example.com/v1",
                bearerToken: "sk-test-token",
            }),
        });

        // Should be 200 if the handler uses handle; 400 if it still requires githubUsername
        expect(res.status, await res.clone().text()).toBe(200);

        const data = (await res.json()) as { modelId: string };
        expect(data.modelId).toBe("testuser/my-model");
    },
);

test(
    "GET /my-models returns modelId keyed on handle for listed endpoints",
    { timeout: 30_000 },
    async ({ sessionToken, mocks }) => {
        await mocks.enable("github", "tinybird");

        const db = drizzle(env.DB, { schema });
        await seedAllowedUser(db);

        // First create one
        const createRes = await SELF.fetch(MY_MODELS, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Cookie: `better-auth.session_token=${sessionToken}`,
            },
            body: JSON.stringify({
                name: "listed-model",
                baseUrl: "https://upstream.example.com/v1",
                bearerToken: "sk-test-token",
            }),
        });
        expect(createRes.status, await createRes.clone().text()).toBe(200);

        // Now list
        const listRes = await SELF.fetch(MY_MODELS, {
            headers: {
                Cookie: `better-auth.session_token=${sessionToken}`,
            },
        });
        expect(listRes.status).toBe(200);

        const { data } = (await listRes.json()) as {
            data: { modelId: string }[];
        };
        expect(data.length).toBeGreaterThan(0);
        expect(data[0].modelId).toBe("testuser/listed-model");
    },
);
