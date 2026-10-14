import { env, SELF } from "cloudflare:test";
import { INVITE_REF_COOKIE } from "@shared/auth/additional-fields.ts";
import { signSessionToken } from "@shared/auth/session-token.ts";
import * as schema from "@shared/db/better-auth.ts";
import { session as sessionTable } from "@shared/db/better-auth.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { expect } from "vitest";
import { POLLINATIONS_AI_GITHUB_ID } from "../src/services/quests/groups/referrals.ts";
import { signInWithGithub, test } from "./fixtures.ts";

for (const ref of [
    "image",
    "text",
    "agent_low_balance_topup",
    "agent_low_balance_quests",
    "agent_key_budget",
    "agent_grant",
]) {
    test(`tracks the ${ref} referral`, async ({ mocks }) => {
        await mocks.enable("tinybird");

        const response = await SELF.fetch(
            `https://enter.pollinations.ai/api/referral?ref=${ref}`,
            { method: "POST" },
        );

        expect(response.status).toBe(204);
        await expect
            .poll(() => mocks.tinybird.state.referralEvents)
            .toEqual([
                expect.objectContaining({
                    ref,
                    metadata: '{"logged_in":false}',
                }),
            ]);
    });

    test(`tracks a signed-in ${ref} referral`, async ({
        mocks,
        sessionToken,
    }) => {
        await mocks.enable("tinybird");
        const response = await SELF.fetch(
            `http://localhost:3000/api/referral?ref=${ref}`,
            {
                method: "POST",
                headers: {
                    Cookie: `better-auth.session_token=${sessionToken}`,
                },
            },
        );

        expect(response.status).toBe(204);
        await expect
            .poll(() => mocks.tinybird.state.referralEvents)
            .toEqual([
                {
                    timestamp: expect.any(String),
                    ref,
                    metadata: '{"logged_in":true}',
                },
            ]);
    });
}

test("an expired session counts as signed out", async ({
    mocks,
    sessionToken,
}) => {
    await mocks.enable("tinybird");
    await drizzle(env.DB)
        .update(sessionTable)
        .set({ expiresAt: new Date(0) });
    const response = await SELF.fetch(
        "http://localhost:3000/api/referral?ref=agent_low_balance_topup",
        {
            method: "POST",
            headers: { Cookie: `better-auth.session_token=${sessionToken}` },
        },
    );
    expect(response.status).toBe(204);
    await expect
        .poll(() => mocks.tinybird.state.referralEvents)
        .toEqual([
            expect.objectContaining({ metadata: '{"logged_in":false}' }),
        ]);
});

test("an API key alone does not count as a signed-in visitor", async ({
    mocks,
    apiKey,
}) => {
    await mocks.enable("tinybird");
    const response = await SELF.fetch(
        "http://localhost:3000/api/referral?ref=agent_low_balance_topup",
        { method: "POST", headers: { Authorization: `Bearer ${apiKey}` } },
    );
    expect(response.status).toBe(204);
    await expect
        .poll(() => mocks.tinybird.state.referralEvents)
        .toEqual([
            expect.objectContaining({ metadata: '{"logged_in":false}' }),
        ]);
});

test("does not track unknown referrals", async ({ mocks }) => {
    await mocks.enable("tinybird");

    const response = await SELF.fetch(
        "https://enter.pollinations.ai/api/referral?ref=unknown",
        { method: "POST" },
    );

    expect(response.status).toBe(204);
    await expect.poll(() => mocks.tinybird.state.referralEvents).toEqual([]);
});

async function insertUser(
    id: string,
    githubId: number,
    createdAt = new Date(),
) {
    await drizzle(env.DB, { schema })
        .insert(schema.user)
        .values({
            id,
            name: id,
            email: `${id}@example.com`,
            githubId,
            createdAt,
            updatedAt: createdAt,
        });
}

async function referredBy(userId: string) {
    const [row] = await drizzle(env.DB, { schema })
        .select({ referredBy: schema.user.referredBy })
        .from(schema.user)
        .where(eq(schema.user.id, userId));
    return row?.referredBy;
}

test("signing up through an invite link records the inviter", async ({
    mocks,
}) => {
    await mocks.enable("github", "tinybird");
    await insertUser("inviter", 777);

    await signInWithGithub(`${INVITE_REF_COOKIE}=777`);

    const [newUser] = await drizzle(env.DB, { schema })
        .select({ referredBy: schema.user.referredBy })
        .from(schema.user)
        .where(eq(schema.user.githubId, mocks.github.state.user.id));
    expect(newUser?.referredBy).toBe("inviter");
});

test("an app login refers a new user to the app owner, except old users, the owner and first-party apps", async ({
    accountToken,
}) => {
    const db = drizzle(env.DB, { schema });
    const owner = await db
        .select({ id: schema.user.id })
        .from(schema.user)
        .get();
    if (!owner) throw new Error("Missing fixture user");
    const appResponse = await SELF.fetch(
        "http://localhost:3000/api/account/keys",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${accountToken}`,
            },
            body: JSON.stringify({
                name: "referring-app",
                type: "publishable",
                redirectUris: ["https://app.example/callback"],
            }),
        },
    );
    expect(appResponse.status).toBe(200);
    const appKey = (await appResponse.json()) as { key: string };
    const logInThroughApp = async (userId: string) => {
        const token = await signSessionToken({
            secret: env.BETTER_AUTH_SECRET,
            userId,
        });
        const response = await SELF.fetch(
            "http://localhost:3000/api/account/keys",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    name: "app-login",
                    type: "secret",
                    consent: {
                        requestedClientId: appKey.key,
                        redirectUri: "https://app.example/callback",
                        redirectOrigin: "https://app.example",
                    },
                }),
            },
        );
        expect(response.status).toBe(200);
    };

    await insertUser("new-user", 1001);
    await insertUser("old-user", 1002, new Date(Date.now() - 2 * 3600_000));
    for (const userId of ["new-user", "old-user", owner.id]) {
        await logInThroughApp(userId);
    }
    expect(await referredBy("new-user")).toBe(owner.id);
    expect(await referredBy("old-user")).toBeNull();
    expect(await referredBy(owner.id)).toBeNull();

    await db
        .update(schema.user)
        .set({ githubId: POLLINATIONS_AI_GITHUB_ID })
        .where(eq(schema.user.id, owner.id));
    await insertUser("first-party-user", 1003);
    await logInThroughApp("first-party-user");
    expect(await referredBy("first-party-user")).toBeNull();
});
