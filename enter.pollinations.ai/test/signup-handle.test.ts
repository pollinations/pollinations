import { env } from "cloudflare:test";
import * as schema from "@shared/db/better-auth.ts";
import { drizzle } from "drizzle-orm/d1";
import { expect } from "vitest";
import { test } from "./fixtures.ts";

// After a GitHub OAuth signup the user row's handle should be set to
// the GitHub login from the mocked profile ("testuser").
test("github signup persists handle from profile.login", async ({
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    sessionToken: _sessionToken,
}) => {
    const db = drizzle(env.DB, { schema });

    const [u] = await db
        .select({ handle: schema.user.handle })
        .from(schema.user)
        .limit(1);

    expect(u.handle).toBe("testuser");
});
