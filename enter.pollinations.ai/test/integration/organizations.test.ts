import { env, SELF } from "cloudflare:test";
import * as schema from "@shared/db/better-auth.ts";
import type { MockAPI } from "@shared/test/mocks/fetch.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { describe, expect } from "vitest";
import { test } from "../fixtures.ts";
import type { MockGithubState } from "../mocks/github.ts";

type SignupData = { url: string };

/**
 * Signs up a second, distinct GitHub identity through the same OAuth flow
 * `fixtures.ts`'s `sessionToken` fixture uses, after mutating the mock
 * GitHub user in place. Needed because the shared `sessionToken` fixture
 * always mints the same hardcoded mock identity — invite/accept flows need
 * a second real account to invite.
 *
 * The `sessionToken` fixture calls `mocks.clear()` right after signing in
 * (so later requests in the test aren't accidentally still mocked), so this
 * re-enables the github handler before repeating the OAuth dance.
 */
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

describe("Organizations", () => {
    test("owner can create, view, and rename an organization", async ({
        sessionToken,
    }) => {
        const created = await authedFetch("/api/organizations", sessionToken, {
            method: "POST",
            body: JSON.stringify({ name: "Acme Inc" }),
        });
        expect(created.status).toBe(200);
        const org = await created.json();
        expect(org).toMatchObject({
            name: "Acme Inc",
            role: "owner",
            packBalance: 0,
            canManageApiKeys: true,
            canFundOrganization: true,
        });

        const listed = await authedFetch("/api/organizations", sessionToken);
        expect(listed.status).toBe(200);
        const { data } = await listed.json();
        expect(data).toHaveLength(1);
        expect(data[0].id).toBe(org.id);

        const renamed = await authedFetch(
            `/api/organizations/${org.id}`,
            sessionToken,
            { method: "PATCH", body: JSON.stringify({ name: "Acme Corp" }) },
        );
        expect(renamed.status).toBe(200);
        expect((await renamed.json()).name).toBe("Acme Corp");
    });

    test("invite by GitHub username is case-insensitive, and the invitee can accept", async ({
        sessionToken,
        mocks,
    }) => {
        const created = await authedFetch("/api/organizations", sessionToken, {
            method: "POST",
            body: JSON.stringify({ name: "Acme Inc" }),
        });
        const org = await created.json();

        const secondUserToken = await signUpSecondUser(mocks, {
            id: 99999,
            login: "SecondUser",
            name: "Second User",
            email: "second@example.com",
        });

        const invited = await authedFetch(
            `/api/organizations/${org.id}/members`,
            sessionToken,
            {
                method: "POST",
                body: JSON.stringify({
                    githubUsername: "seconduser", // lowercase on purpose
                    canManageApiKeys: true,
                }),
            },
        );
        expect(invited.status).toBe(200);
        const member = await invited.json();
        expect(member.status).toBe("pending");
        expect(member.githubUsername).toBe("SecondUser");
        expect(member.canManageApiKeys).toBe(true);
        expect(member.canFundOrganization).toBe(false);

        // A duplicate invite is rejected via the unique index.
        const duplicate = await authedFetch(
            `/api/organizations/${org.id}/members`,
            sessionToken,
            {
                method: "POST",
                body: JSON.stringify({ githubUsername: "seconduser" }),
            },
        );
        expect(duplicate.status).toBe(409);

        // Invitee sees the pending invitation.
        const invitations = await authedFetch(
            "/api/organizations/invitations",
            secondUserToken,
        );
        expect(invitations.status).toBe(200);
        const { data: pending } = await invitations.json();
        expect(pending).toHaveLength(1);
        expect(pending[0].organizationId).toBe(org.id);

        // Accept, then the org shows up for the second user too.
        const accepted = await authedFetch(
            `/api/organizations/invitations/${member.id}/accept`,
            secondUserToken,
            { method: "POST" },
        );
        expect(accepted.status).toBe(200);

        const secondUserOrgs = await authedFetch(
            "/api/organizations",
            secondUserToken,
        );
        const { data: orgsForSecondUser } = await secondUserOrgs.json();
        expect(orgsForSecondUser).toHaveLength(1);
        expect(orgsForSecondUser[0]).toMatchObject({
            id: org.id,
            role: "member",
            canManageApiKeys: true,
            canFundOrganization: false,
        });

        // Roster is visible to the (now-active) member.
        const roster = await authedFetch(
            `/api/organizations/${org.id}/members`,
            secondUserToken,
        );
        const { data: members } = await roster.json();
        expect(members).toHaveLength(1);
        expect(members[0].status).toBe("active");
    });

    test("declining an invitation deletes it and allows re-inviting later", async ({
        sessionToken,
        mocks,
    }) => {
        const created = await authedFetch("/api/organizations", sessionToken, {
            method: "POST",
            body: JSON.stringify({ name: "Acme Inc" }),
        });
        const org = await created.json();

        const secondUserToken = await signUpSecondUser(mocks, {
            id: 88888,
            login: "declineduser",
            name: "Decline User",
            email: "decline@example.com",
        });

        const invited = await authedFetch(
            `/api/organizations/${org.id}/members`,
            sessionToken,
            {
                method: "POST",
                body: JSON.stringify({ githubUsername: "declineduser" }),
            },
        );
        const member = await invited.json();

        const declined = await authedFetch(
            `/api/organizations/invitations/${member.id}/decline`,
            secondUserToken,
            { method: "POST" },
        );
        expect(declined.status).toBe(200);

        const invitationsAfter = await authedFetch(
            "/api/organizations/invitations",
            secondUserToken,
        );
        expect((await invitationsAfter.json()).data).toHaveLength(0);

        // Re-inviting the same person no longer collides.
        const reInvited = await authedFetch(
            `/api/organizations/${org.id}/members`,
            sessionToken,
            {
                method: "POST",
                body: JSON.stringify({ githubUsername: "declineduser" }),
            },
        );
        expect(reInvited.status).toBe(200);
    });

    test("inviting an unknown GitHub username 404s", async ({
        sessionToken,
    }) => {
        const created = await authedFetch("/api/organizations", sessionToken, {
            method: "POST",
            body: JSON.stringify({ name: "Acme Inc" }),
        });
        const org = await created.json();

        const invited = await authedFetch(
            `/api/organizations/${org.id}/members`,
            sessionToken,
            {
                method: "POST",
                body: JSON.stringify({ githubUsername: "no-such-github-user" }),
            },
        );
        expect(invited.status).toBe(404);
    });

    test("a read-only member cannot rename or invite, and a non-member gets 404", async ({
        sessionToken,
        mocks,
    }) => {
        const created = await authedFetch("/api/organizations", sessionToken, {
            method: "POST",
            body: JSON.stringify({ name: "Acme Inc" }),
        });
        const org = await created.json();

        const memberToken = await signUpSecondUser(mocks, {
            id: 77777,
            login: "readonlyuser",
            name: "Readonly User",
            email: "readonly@example.com",
        });
        const invited = await authedFetch(
            `/api/organizations/${org.id}/members`,
            sessionToken,
            {
                method: "POST",
                body: JSON.stringify({ githubUsername: "readonlyuser" }),
            },
        );
        const member = await invited.json();
        await authedFetch(
            `/api/organizations/invitations/${member.id}/accept`,
            memberToken,
            { method: "POST" },
        );

        const renameAttempt = await authedFetch(
            `/api/organizations/${org.id}`,
            memberToken,
            { method: "PATCH", body: JSON.stringify({ name: "Hijacked" }) },
        );
        expect(renameAttempt.status).toBe(403);

        const inviteAttempt = await authedFetch(
            `/api/organizations/${org.id}/members`,
            memberToken,
            {
                method: "POST",
                body: JSON.stringify({ githubUsername: "readonlyuser" }),
            },
        );
        expect(inviteAttempt.status).toBe(403);

        // Read-only member CAN still view the org and its balance.
        const view = await authedFetch(
            `/api/organizations/${org.id}`,
            memberToken,
        );
        expect(view.status).toBe(200);
        expect((await view.json()).canManageApiKeys).toBe(false);

        // A third, uninvolved user gets a 404 (not a 403), so the endpoint
        // isn't an oracle for which org ids exist.
        const outsiderToken = await signUpSecondUser(mocks, {
            id: 66666,
            login: "outsider",
            name: "Outsider",
            email: "outsider@example.com",
        });
        const outsiderView = await authedFetch(
            `/api/organizations/${org.id}`,
            outsiderToken,
        );
        expect(outsiderView.status).toBe(404);
    });

    test("owner can update member permissions and remove a member", async ({
        sessionToken,
        mocks,
    }) => {
        const created = await authedFetch("/api/organizations", sessionToken, {
            method: "POST",
            body: JSON.stringify({ name: "Acme Inc" }),
        });
        const org = await created.json();

        const memberToken = await signUpSecondUser(mocks, {
            id: 55555,
            login: "teammate",
            name: "Teammate",
            email: "teammate@example.com",
        });
        const invited = await authedFetch(
            `/api/organizations/${org.id}/members`,
            sessionToken,
            {
                method: "POST",
                body: JSON.stringify({ githubUsername: "teammate" }),
            },
        );
        const member = await invited.json();
        await authedFetch(
            `/api/organizations/invitations/${member.id}/accept`,
            memberToken,
            { method: "POST" },
        );

        const updated = await authedFetch(
            `/api/organizations/${org.id}/members/${member.id}`,
            sessionToken,
            {
                method: "PATCH",
                body: JSON.stringify({ canFundOrganization: true }),
            },
        );
        expect(updated.status).toBe(200);
        expect((await updated.json()).canFundOrganization).toBe(true);

        const removed = await authedFetch(
            `/api/organizations/${org.id}/members/${member.id}`,
            sessionToken,
            { method: "DELETE" },
        );
        expect(removed.status).toBe(200);

        const orgsAfterRemoval = await authedFetch(
            "/api/organizations",
            memberToken,
        );
        expect((await orgsAfterRemoval.json()).data).toHaveLength(0);
    });

    test("owner cannot leave; deleting the organization reports how many keys were removed", async ({
        sessionToken,
    }) => {
        const created = await authedFetch("/api/organizations", sessionToken, {
            method: "POST",
            body: JSON.stringify({ name: "Acme Inc" }),
        });
        const org = await created.json();

        const leaveAttempt = await authedFetch(
            `/api/organizations/${org.id}/leave`,
            sessionToken,
            { method: "POST" },
        );
        expect(leaveAttempt.status).toBe(400);

        const deleted = await authedFetch(
            `/api/organizations/${org.id}`,
            sessionToken,
            { method: "DELETE" },
        );
        expect(deleted.status).toBe(200);
        expect(await deleted.json()).toMatchObject({ deletedApiKeyCount: 0 });

        const view = await authedFetch(
            `/api/organizations/${org.id}`,
            sessionToken,
        );
        expect(view.status).toBe(404);
    });

    test("deleting an organization cascades to its member rows and API keys in D1, but keeps the funding ledger row (with its org association cleared)", async ({
        sessionToken,
        mocks,
    }) => {
        const created = await authedFetch("/api/organizations", sessionToken, {
            method: "POST",
            body: JSON.stringify({ name: "Acme Inc" }),
        });
        const org = await created.json();

        await signUpSecondUser(mocks, {
            id: 44444,
            login: "cascadecheck",
            name: "Cascade Check",
            email: "cascade@example.com",
        });
        await authedFetch(
            `/api/organizations/${org.id}/members`,
            sessionToken,
            {
                method: "POST",
                body: JSON.stringify({ githubUsername: "cascadecheck" }),
            },
        );

        const createdKey = await authedFetch("/api/api-keys", sessionToken, {
            method: "POST",
            body: JSON.stringify({ name: "org-key", organizationId: org.id }),
        });
        const key = await createdKey.json();

        const db = drizzle(env.DB, { schema });
        const orgRow = await db.query.organization.findFirst({
            where: eq(schema.organization.id, org.id),
        });
        if (!orgRow) throw new Error("Organization row missing after create");
        // A funding ledger row is inserted directly (rather than driven
        // through the Stripe webhook, which needs a signing secret this
        // suite can't decrypt) to exercise the same FK the webhook path
        // would hit — this is the idempotency guard and must survive.
        await db.insert(schema.stripeCheckoutCredits).values({
            sessionId: `cs_test_${org.id}`,
            eventId: "evt_test",
            eventType: "checkout.session.completed",
            userId: orgRow.ownerUserId,
            pollenCredited: 5,
            organizationId: org.id,
        });

        const membersBefore = await db.query.organizationMember.findMany({
            where: eq(schema.organizationMember.organizationId, org.id),
        });
        expect(membersBefore).toHaveLength(1);

        const deleted = await authedFetch(
            `/api/organizations/${org.id}`,
            sessionToken,
            { method: "DELETE" },
        );
        expect(deleted.status).toBe(200);
        expect(await deleted.json()).toEqual({
            id: org.id,
            deletedApiKeyCount: 1,
        });

        const membersAfter = await db.query.organizationMember.findMany({
            where: eq(schema.organizationMember.organizationId, org.id),
        });
        expect(membersAfter).toHaveLength(0);

        const keyAfter = await db.query.apikey.findFirst({
            where: eq(schema.apikey.id, key.id),
        });
        expect(keyAfter).toBeUndefined();

        const ledgerRow = await db.query.stripeCheckoutCredits.findFirst({
            where: eq(
                schema.stripeCheckoutCredits.sessionId,
                `cs_test_${org.id}`,
            ),
        });
        expect(ledgerRow).toBeDefined();
        expect(ledgerRow?.organizationId).toBeNull();
        expect(ledgerRow?.pollenCredited).toBe(5);
    });
});
