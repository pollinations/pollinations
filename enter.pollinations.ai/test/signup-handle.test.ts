import { env, SELF } from "cloudflare:test";
import * as schema from "@shared/db/better-auth.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";
import { ensureUniqueHandle, sanitizeHandle } from "../src/auth.ts";
import { test } from "./fixtures.ts";

// After a GitHub OAuth signup the user row's handle should be set to
// the sanitized (lowercased) GitHub login from the mocked profile ("testuser").
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

// ── handleFallbackPlugin integration ─────────────────────────────────────────

/**
 * Exercises the full better-auth hook chain for a non-GitHub user created via
 * the admin `create-user` endpoint. The hook must fire and assign a handle
 * derived from the email local-part.
 *
 * Level achieved: end-to-end through the real better-auth hook chain via HTTP
 * (POST /api/auth/admin/create-user). We elevate the OAuth user to `admin`
 * role in D1 so their signed session cookie (from the `sessionToken` fixture)
 * has permission to call `createUser`. This avoids bootstrapping raw unsigned
 * sessions, which better-auth's HMAC-signed cookie would reject.
 */
test("handleFallbackPlugin derives handle from email local-part for non-GitHub user", async ({
    sessionToken,
}) => {
    const db = drizzle(env.DB, { schema });

    // Promote the OAuth user to admin role so they can call /admin/create-user.
    await db.update(schema.user).set({ role: "admin" });

    const res = await SELF.fetch(
        "http://localhost:3000/api/auth/admin/create-user",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Cookie: `better-auth.session_token=${sessionToken}`,
            },
            body: JSON.stringify({
                email: "alice.bob@example.com",
                name: "Alice Bob",
            }),
        },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { handle: string } };
    // sanitizeHandle("alice.bob") → "alice-bob"
    expect(body.user.handle).toBe("alice-bob");
});

/**
 * Exercises Fix 1: a new GitHub signup whose login (after sanitisation)
 * collides case-insensitively with an existing handle must receive a
 * suffixed handle instead of hitting the unique index constraint.
 *
 * The mock GitHub user's login is "testuser" (lowercase). We seed a user
 * with a mixed-case handle "TestUser" which normalises to the same value,
 * then run the full OAuth signup flow and assert the new user gets
 * "testuser-1".
 *
 * Level achieved: full OAuth callback flow via HTTP through the real
 * better-auth hook chain. The collision is engineered by seeding the
 * handle before the signup occurs.
 */
test("github signup with colliding handle gets suffixed handle", async ({
    mocks,
}) => {
    const db = drizzle(env.DB, { schema });

    // Seed a user that holds the "testuser" handle (mixed case — the index is
    // on lower(handle) so this is a case-insensitive collision).
    await db.insert(schema.user).values({
        id: "seed-collision",
        name: "Prior TestUser",
        email: "prior-testuser@example.com",
        emailVerified: false,
        handle: "TestUser",
        tier: "spore",
        createdAt: new Date(),
        updatedAt: new Date(),
    });

    // Run the full GitHub OAuth flow. The mock returns login = "testuser",
    // which sanitizeHandle lowercases to "testuser" — a collision with the
    // seeded handle. handleFallbackPlugin must suffix it.
    await mocks.enable("github", "tinybird");

    const signupResponse = await SELF.fetch(
        "http://localhost:3000/api/auth/sign-in/social",
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ provider: "github" }),
        },
    );
    expect(signupResponse.status).toBe(200);
    const signupData = (await signupResponse.json()) as { url: string };
    const signupCookies = signupResponse.headers.get("Set-Cookie");
    if (!signupCookies) throw new Error("Set-Cookie header missing");

    const state = new URL(signupData.url).searchParams.get("state");
    if (!state) throw new Error("state param missing");

    const callbackUrl = new URL(
        "http://localhost:3000/api/auth/callback/github",
    );
    callbackUrl.searchParams.set("code", "test-code");
    callbackUrl.searchParams.set("state", state);

    const callbackResponse = await SELF.fetch(callbackUrl.toString(), {
        method: "GET",
        headers: {
            "User-Agent": "Mozilla/5.0 (compatible; test-browser)",
            Accept: "text/html,application/xhtml+xml",
            Cookie: signupCookies,
        },
        redirect: "manual",
    });
    expect(callbackResponse.status).toBe(302);
    await callbackResponse.text();
    mocks.clear();

    // Find the newly created GitHub user (github_id = 12345, per mock).
    const [newUser] = await db
        .select({ handle: schema.user.handle, githubId: schema.user.githubId })
        .from(schema.user)
        .where(eq(schema.user.githubId, 12345));

    // Must have received a suffix rather than colliding with "TestUser".
    expect(newUser.handle).toBe("testuser-1");
});

// ── sanitizeHandle ────────────────────────────────────────────────────────────

describe("sanitizeHandle", () => {
    it("lowercases input", () => {
        expect(sanitizeHandle("Alice")).toBe("alice");
    });

    it("replaces dots and plus signs with dashes", () => {
        expect(sanitizeHandle("alice.bob+tag")).toBe("alice-bob-tag");
    });

    it("collapses consecutive invalid chars into a single dash", () => {
        expect(sanitizeHandle("alice..bob")).toBe("alice-bob");
    });

    it("strips leading and trailing dashes", () => {
        expect(sanitizeHandle(".alice.")).toBe("alice");
    });

    it("caps at 39 characters", () => {
        const long = "a".repeat(50);
        expect(sanitizeHandle(long).length).toBe(39);
    });

    it("returns empty string when all chars are invalid", () => {
        expect(sanitizeHandle("!@#$%^&*()")).toBe("");
    });

    it("handles slashes (URL-unsafe chars become dashes)", () => {
        expect(sanitizeHandle("foo/bar")).toBe("foo-bar");
    });

    it("preserves valid alphanumeric and hyphen chars", () => {
        expect(sanitizeHandle("my-handle-123")).toBe("my-handle-123");
    });

    it("handles mixed uppercase and symbols", () => {
        expect(sanitizeHandle("Hello.World+42")).toBe("hello-world-42");
    });
});

// ── ensureUniqueHandle ────────────────────────────────────────────────────────

describe("ensureUniqueHandle", () => {
    it("returns the candidate when no clash exists", async () => {
        const db = drizzle(env.DB, { schema });
        const result = await ensureUniqueHandle(db, "newuser");
        expect(result).toBe("newuser");
    });

    it("appends -1 when the base handle is taken", async () => {
        const db = drizzle(env.DB, { schema });

        // Seed a user with handle "taken"
        await db.insert(schema.user).values({
            id: "seed-1",
            name: "Seed User",
            email: "seed1@example.com",
            emailVerified: false,
            handle: "taken",
            tier: "spore",
        });

        const result = await ensureUniqueHandle(db, "taken");
        expect(result).toBe("taken-1");
    });

    it("increments suffix until a free slot is found", async () => {
        const db = drizzle(env.DB, { schema });

        // Occupy "multi", "multi-1", "multi-2"
        await db.insert(schema.user).values([
            {
                id: "seed-m0",
                name: "M0",
                email: "m0@example.com",
                emailVerified: false,
                handle: "multi",
                tier: "spore",
            },
            {
                id: "seed-m1",
                name: "M1",
                email: "m1@example.com",
                emailVerified: false,
                handle: "multi-1",
                tier: "spore",
            },
            {
                id: "seed-m2",
                name: "M2",
                email: "m2@example.com",
                emailVerified: false,
                handle: "multi-2",
                tier: "spore",
            },
        ]);

        const result = await ensureUniqueHandle(db, "multi");
        expect(result).toBe("multi-3");
    });

    it("falls back to random suffix when 0-4 are all taken", async () => {
        const db = drizzle(env.DB, { schema });

        // Occupy "full", "full-1", "full-2", "full-3", "full-4"
        const rows = ["full", "full-1", "full-2", "full-3", "full-4"].map(
            (handle, i) => ({
                id: `seed-f${i}`,
                name: `F${i}`,
                email: `f${i}@example.com`,
                emailVerified: false as const,
                handle,
                tier: "spore",
            }),
        );
        await db.insert(schema.user).values(rows);

        const result = await ensureUniqueHandle(db, "full");
        // Should be "full-<exactly 6 hex chars>" — not one of the 5 taken values
        expect(result).toMatch(/^full-[a-f0-9-]{6}$/);
        expect(["full", "full-1", "full-2", "full-3", "full-4"]).not.toContain(
            result,
        );
    });

    it("caps suffixed handles at 39 chars for a 39-char base candidate", async () => {
        const db = drizzle(env.DB, { schema });

        const maxHandle = "a".repeat(39);

        // Seed the base handle and its -1 variant to force random path
        await db.insert(schema.user).values([
            {
                id: "seed-cap0",
                name: "Cap0",
                email: "cap0@example.com",
                emailVerified: false,
                handle: maxHandle,
                tier: "spore",
            },
            {
                id: "seed-cap1",
                name: "Cap1",
                email: "cap1@example.com",
                emailVerified: false,
                handle: `${maxHandle.slice(0, 37)}-1`,
                tier: "spore",
            },
        ]);

        const result = await ensureUniqueHandle(db, maxHandle);
        // Result should be capped at 39 chars and not equal to either taken value
        expect(result.length).toBeLessThanOrEqual(39);
        expect(result).not.toBe(maxHandle);
        expect(result).not.toBe(`${maxHandle.slice(0, 37)}-1`);
    });

    it("is case-insensitive: TAKEN clashes with taken", async () => {
        const db = drizzle(env.DB, { schema });

        await db.insert(schema.user).values({
            id: "seed-ci",
            name: "CI User",
            email: "ci@example.com",
            emailVerified: false,
            handle: "UPPER",
            tier: "spore",
        });

        const result = await ensureUniqueHandle(db, "upper");
        expect(result).toBe("upper-1");
    });
});
