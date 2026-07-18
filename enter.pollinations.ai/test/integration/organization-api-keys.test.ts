import { env, SELF } from "cloudflare:test";
import * as schema from "@shared/db/better-auth.ts";
import type { MockAPI } from "@shared/test/mocks/fetch.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect } from "vitest";
import { test } from "../fixtures.ts";
import type { MockGithubState } from "../mocks/github.ts";

type SignupData = { url: string };

/** Same helper as organizations.test.ts — see that file for the full comment. */
async function signUpSecondUser(
    mocks: {
        github: MockAPI<MockGithubState>;
        enable: (...names: string[]) => Promise<void>;
        clear: () => Promise<void>;
    },
    identity: { id: number; login: string; name: string; email: string },
): Promise<string> {
    mocks.github.state.user = {
        ...mocks.github.state.user,
        ...identity,
        avatar_url: `https://avatars.githubusercontent.com/u/${identity.id}?v=4`,
        created_at: "2018-01-01T00:00:00Z",
    };
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
    const signupData = (await signupResponse.json()) as SignupData;
    const signupCookies = signupResponse.headers.get("Set-Cookie");
    if (!signupCookies) throw new Error("Set-Cookie header is missing");

    const forwardUrl = new URL(signupData.url);
    const state = forwardUrl.searchParams.get("state");
    if (!state) throw new Error("State param is missing");

    const callbackUrl = new URL(
        "http://localhost:3000/api/auth/callback/github",
    );
    callbackUrl.searchParams.set("code", "test-code");
    callbackUrl.searchParams.set("state", state);

    const callbackResponse = await SELF.fetch(callbackUrl.toString(), {
        method: "GET",
        headers: {
            "User-Agent": "Mozilla/5.0 (compatible; test-browser)",
            "Accept": "text/html,application/xhtml+xml",
            "Cookie": signupCookies,
        },
        redirect: "manual",
    });
    expect(callbackResponse.status).toBe(302);
    await callbackResponse.text();

    const setCookieHeader = callbackResponse.headers.get("Set-Cookie");
    const sessionMatch = setCookieHeader?.match(
        /better-auth\.session_token=([^;]+)/,
    );
    if (!sessionMatch?.[1]) throw new Error("Failed to get session token");
    await mocks.clear();
    return sessionMatch[1];
}

function authedFetch(path: string, sessionToken: string, init?: RequestInit) {
    return SELF.fetch(`http://localhost:3000${path}`, {
        ...init,
        headers: {
            "Content-Type": "application/json",
            Cookie: `better-auth.session_token=${sessionToken}`,
            ...init?.headers,
        },
    });
}

async function createOrg(sessionToken: string, name: string) {
    const response = await authedFetch("/api/organizations", sessionToken, {
        method: "POST",
        body: JSON.stringify({ name }),
    });
    return response.json();
}

async function inviteAndAccept(
    ownerSessionToken: string,
    memberSessionToken: string,
    organizationId: string,
    githubUsername: string,
    permissions: {
        canManageApiKeys?: boolean;
        canFundOrganization?: boolean;
    } = {},
) {
    const invited = await authedFetch(
        `/api/organizations/${organizationId}/members`,
        ownerSessionToken,
        {
            method: "POST",
            body: JSON.stringify({ githubUsername, ...permissions }),
        },
    );
    const member = await invited.json();
    await authedFetch(
        `/api/organizations/invitations/${member.id}/accept`,
        memberSessionToken,
        { method: "POST" },
    );
    return member;
}

describe("Organization-owned API keys", () => {
    test("owner can create an org-owned key; it is attributed to the owner but scoped to the org", async ({
        sessionToken,
    }) => {
        const org = await createOrg(sessionToken, "Acme Inc");

        const created = await authedFetch("/api/api-keys", sessionToken, {
            method: "POST",
            body: JSON.stringify({ name: "org-key", organizationId: org.id }),
        });
        expect(created.status).toBe(200);
        const key = await created.json();
        expect(key.organizationId).toBe(org.id);

        const db = drizzle(env.DB, { schema });
        const [row] = await db
            .select({
                userId: schema.apikey.userId,
                organizationId: schema.apikey.organizationId,
            })
            .from(schema.apikey)
            .where(eq(schema.apikey.id, key.id));
        expect(row?.organizationId).toBe(org.id);
        expect(row?.userId).toBeTruthy(); // creator recorded for attribution
    });

    test("a member without canManageApiKeys cannot create or manage org keys, but a manager (not the creator) can", async ({
        sessionToken,
        mocks,
    }) => {
        const org = await createOrg(sessionToken, "Acme Inc");

        const readOnlyToken = await signUpSecondUser(mocks, {
            id: 11111,
            login: "readonly-keys",
            name: "Read Only",
            email: "readonly-keys@example.com",
        });
        await inviteAndAccept(
            sessionToken,
            readOnlyToken,
            org.id,
            "readonly-keys",
        );

        const forbiddenCreate = await authedFetch(
            "/api/api-keys",
            readOnlyToken,
            {
                method: "POST",
                body: JSON.stringify({
                    name: "should-fail",
                    organizationId: org.id,
                }),
            },
        );
        expect(forbiddenCreate.status).toBe(403);

        const managerToken = await signUpSecondUser(mocks, {
            id: 22222,
            login: "key-manager",
            name: "Key Manager",
            email: "key-manager@example.com",
        });
        await inviteAndAccept(
            sessionToken,
            managerToken,
            org.id,
            "key-manager",
            {
                canManageApiKeys: true,
            },
        );

        // Owner creates the key (creator = owner)...
        const created = await authedFetch("/api/api-keys", sessionToken, {
            method: "POST",
            body: JSON.stringify({ name: "org-key", organizationId: org.id }),
        });
        const key = await created.json();

        // ...but the manager (a different member) can still update and delete it.
        const updated = await authedFetch(
            `/api/api-keys/${key.id}/update`,
            managerToken,
            {
                method: "POST",
                body: JSON.stringify({ allowedModels: ["flux"] }),
            },
        );
        expect(updated.status).toBe(200);

        const deleted = await authedFetch(
            `/api/api-keys/${key.id}/delete`,
            managerToken,
            { method: "POST" },
        );
        expect(deleted.status).toBe(200);

        const db = drizzle(env.DB, { schema });
        const remaining = await db.query.apikey.findFirst({
            where: eq(schema.apikey.id, key.id),
        });
        expect(remaining).toBeUndefined();
    });

    test("GET /api/api-keys?organizationId= is visible to a read-only member and excludes personal keys", async ({
        sessionToken,
        mocks,
    }) => {
        const org = await createOrg(sessionToken, "Acme Inc");
        await authedFetch("/api/api-keys", sessionToken, {
            method: "POST",
            body: JSON.stringify({ name: "org-key", organizationId: org.id }),
        });
        // A personal key for the same owner should not leak into the org list.
        await authedFetch("/api/api-keys", sessionToken, {
            method: "POST",
            body: JSON.stringify({ name: "personal-key" }),
        });

        const readOnlyToken = await signUpSecondUser(mocks, {
            id: 33333,
            login: "viewer",
            name: "Viewer",
            email: "viewer@example.com",
        });
        await inviteAndAccept(sessionToken, readOnlyToken, org.id, "viewer");

        const listed = await authedFetch(
            `/api/api-keys?organizationId=${org.id}`,
            readOnlyToken,
        );
        expect(listed.status).toBe(200);
        const { data } = await listed.json();
        expect(data).toHaveLength(1);
        expect(data[0].name).toBe("org-key");

        // A non-member gets 404, not an empty list or a 403.
        const outsiderToken = await signUpSecondUser(mocks, {
            id: 44444,
            login: "outsider-keys",
            name: "Outsider",
            email: "outsider-keys@example.com",
        });
        const outsiderListed = await authedFetch(
            `/api/api-keys?organizationId=${org.id}`,
            outsiderToken,
        );
        expect(outsiderListed.status).toBe(404);
    });

    // Every other org-scoping test above drives org selection through the
    // `?organizationId=` query param. The actual frontend never does that —
    // `frontend/src/api.ts`'s hc() client attaches org context via an
    // `X-Organization-Id` header instead (see `active-organization.ts` and
    // `readOrganizationIdParam` in `organizations.ts`), which nothing else
    // here exercises. Prove that transport actually works end to end.
    test("GET /api/api-keys and GET /api/customer/balance are org-scoped via the X-Organization-Id header (no query param)", async ({
        sessionToken,
    }) => {
        const org = await createOrg(sessionToken, "Acme Inc");
        await authedFetch("/api/api-keys", sessionToken, {
            method: "POST",
            body: JSON.stringify({ name: "org-key", organizationId: org.id }),
        });
        await authedFetch("/api/api-keys", sessionToken, {
            method: "POST",
            body: JSON.stringify({ name: "personal-key" }),
        });

        const listed = await authedFetch("/api/api-keys", sessionToken, {
            headers: { "X-Organization-Id": org.id },
        });
        expect(listed.status).toBe(200);
        const { data } = await listed.json();
        expect(data).toHaveLength(1);
        expect(data[0].name).toBe("org-key");

        const balance = await authedFetch(
            "/api/customer/balance",
            sessionToken,
            {
                headers: { "X-Organization-Id": org.id },
            },
        );
        expect(balance.status).toBe(200);
        expect(await balance.json()).toEqual({
            tierBalance: 0,
            packBalance: org.packBalance,
        });
    });
});
