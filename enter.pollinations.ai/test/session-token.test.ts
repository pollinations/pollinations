import { env, SELF } from "cloudflare:test";
import { authenticateApiKeyRequest } from "@shared/auth/api-key.ts";
import { signSessionToken } from "@shared/auth/session-token.ts";
import { expect } from "vitest";
import { test } from "./fixtures.ts";

const BASE = "http://localhost:3000";

async function mintSessionToken(sessionCookie: string): Promise<string> {
    const response = await SELF.fetch(`${BASE}/api/session-token`, {
        method: "POST",
        headers: { Cookie: `better-auth.session_token=${sessionCookie}` },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
        token: string;
        expiresIn: number;
    };
    expect(body.expiresIn).toBe(900);
    return body.token;
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

test("a session token acts as the account owner on the account API", async ({
    sessionToken,
}) => {
    const token = await mintSessionToken(sessionToken);

    const created = await SELF.fetch(`${BASE}/api/account/keys`, {
        method: "POST",
        headers: { ...bearer(token), "Content-Type": "application/json" },
        body: JSON.stringify({ name: "made-in-dashboard" }),
    });
    expect(created.status).toBe(200);
    const key = (await created.json()) as {
        id: string;
        metadata: Record<string, unknown>;
    };
    expect(key.metadata.createdVia).toBe("dashboard");
    expect(key.metadata.createdByApiKeyId).toBeUndefined();

    const listed = await SELF.fetch(`${BASE}/api/account/keys`, {
        headers: bearer(token),
    });
    expect(listed.status).toBe(200);
    const { data } = (await listed.json()) as { data: { id: string }[] };
    expect(data.map((row) => row.id)).toContain(key.id);

    const balance = await SELF.fetch(`${BASE}/api/account/balance`, {
        headers: bearer(token),
    });
    expect(await balance.json()).toHaveProperty("accountBalance");
});

test("the account API refuses the session cookie", async ({ sessionToken }) => {
    const response = await SELF.fetch(`${BASE}/api/account/profile`, {
        headers: { Cookie: `better-auth.session_token=${sessionToken}` },
    });
    expect(response.status).toBe(401);
});

test("only the session cookie can mint a session token", async ({ apiKey }) => {
    const response = await SELF.fetch(`${BASE}/api/session-token`, {
        method: "POST",
        headers: bearer(apiKey),
    });
    expect(response.status).toBe(401);
});

test("session tokens are refused in the query string, expired, forged or for a banned user", async ({
    sessionToken,
}) => {
    const token = await mintSessionToken(sessionToken);
    const auth = await authenticateApiKeyRequest({
        request: new Request(BASE, { headers: bearer(token) }),
        env,
    });
    const userId = auth?.user?.id as string;
    expect(userId).toBeTruthy();
    expect(auth?.apiKey).toBeUndefined();

    const profile = (headers: Record<string, string> = {}, query = "") =>
        SELF.fetch(`${BASE}/api/account/profile${query}`, { headers });

    expect((await profile({}, `?key=${token}`)).status).toBe(401);

    const expired = await signSessionToken({
        secret: env.BETTER_AUTH_SECRET,
        userId,
        now: Math.floor(Date.now() / 1000) - 3600,
    });
    expect((await profile(bearer(expired))).status).toBe(401);

    const forged = await signSessionToken({ secret: "not-the-secret", userId });
    expect((await profile(bearer(forged))).status).toBe(401);

    await env.DB.prepare("UPDATE user SET banned = 1 WHERE id = ?")
        .bind(userId)
        .run();
    expect((await profile(bearer(token))).status).toBe(403);
});
