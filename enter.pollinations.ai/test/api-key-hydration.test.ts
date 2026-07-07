import { env } from "cloudflare:test";
import { authenticateApiKeyRequest } from "@shared/auth/api-key.ts";
import * as schema from "@shared/db/better-auth.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { expect } from "vitest";
import { test } from "./fixtures.ts";

test("resolved user hydrates githubId/githubUsername from the account row", async ({
    apiKey,
}) => {
    const db = drizzle(env.DB, { schema });

    // The fixture creates a user via GitHub OAuth; get that user's id.
    const [u] = await db
        .select({ id: schema.user.id })
        .from(schema.user)
        .limit(1);

    // Replace any existing github account rows with one that has
    // known, assertable values — so the hydration result is deterministic.
    await db.delete(schema.account).where(eq(schema.account.userId, u.id));

    await db.insert(schema.account).values({
        id: "a-fixture-github-hydration",
        accountId: "98765",
        providerId: "github",
        username: "fixtureuser",
        userId: u.id,
        createdAt: new Date(),
        updatedAt: new Date(),
    });

    const result = await authenticateApiKeyRequest({
        request: new Request("http://localhost/", {
            headers: { Authorization: `Bearer ${apiKey}` },
        }),
        env,
    });

    expect(result?.user?.githubId).toBe(98765);
    expect(result?.user?.githubUsername).toBe("fixtureuser");
});
