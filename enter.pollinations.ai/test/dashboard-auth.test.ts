import { env, SELF } from "cloudflare:test";
import * as schema from "@shared/db/better-auth.ts";
import { drizzle } from "drizzle-orm/d1";
import { expect, vi } from "vitest";
import { test } from "./fixtures.ts";

const BASE = "http://localhost:3000";
const KPI = "/api/dashboards/kpi/registrations";
const ECONOMICS = "/api/dashboards/economics/pipes/economics_bank_ledger_api";
const ORIGIN = "https://economics.pollinations.ai";
const cookie = (token: string) => ({
    Cookie: `better-auth.session_token=${token}`,
});

test.each([KPI, ECONOMICS])("requires a session for %s", async (path) => {
    const response = await SELF.fetch(BASE + path);
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
});

test.for([KPI, ECONOMICS])("rejects a regular user for %s", async (path, {
    sessionToken,
}) => {
    const response = await SELF.fetch(BASE + path, {
        headers: cookie(sessionToken),
    });
    expect(response.status).toBe(403);
});

test("an admin's API key does not inherit dashboard access", async ({
    apiKey,
}) => {
    await drizzle(env.DB, { schema })
        .update(schema.user)
        .set({ role: "admin" });
    const response = await SELF.fetch(BASE + KPI, {
        headers: { Authorization: `Bearer ${apiKey}` },
    });
    expect(response.status).toBe(401);
});

test("reuses the settings session and checks the current admin role on each read", async ({
    sessionToken,
    mocks,
}) => {
    const db = drizzle(env.DB, { schema });
    await db.update(schema.user).set({ role: "admin" });
    mocks.tinybird.handlerMap["localhost:7181"] = async () =>
        Response.json({ data: [{ week: "2026-08-31", registrations: 7 }] });
    await mocks.enable("tinybird");

    const response = await SELF.fetch(BASE + KPI, {
        headers: cookie(sessionToken),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("Set-Cookie") || "").not.toContain(
        "pollinations_session",
    );
    expect(await response.json()).toEqual({
        data: [{ week: "2026-08-31", registrations: 7 }],
    });

    await db.update(schema.user).set({ role: "user" });
    expect(
        (await SELF.fetch(BASE + KPI, { headers: cookie(sessionToken) }))
            .status,
    ).toBe(403);
    await db.update(schema.user).set({ role: "admin", banned: true });
    expect(
        (await SELF.fetch(BASE + KPI, { headers: cookie(sessionToken) }))
            .status,
    ).toBe(403);
});

test("forwards only allowed Economics pipes using the dedicated read token", async ({
    sessionToken,
    mocks,
}) => {
    await drizzle(env.DB, { schema })
        .update(schema.user)
        .set({ role: "admin" });
    mocks.tinybird.handlerMap["localhost:7181"] = async () =>
        Response.json({ data: [{ amount: 12 }] });
    await mocks.enable("tinybird");
    const response = await SELF.fetch(BASE + ECONOMICS, {
        headers: cookie(sessionToken),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: [{ amount: 12 }] });
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        "http://localhost:7181/v0/pipes/economics_bank_ledger_api.json",
        { headers: { Authorization: "Bearer test_economics_read_token" } },
    );
    const unknown = await SELF.fetch(
        `${BASE}/api/dashboards/economics/pipes/private_users`,
        { headers: cookie(sessionToken) },
    );
    expect(unknown.status).toBe(404);
});

test("signing out of Enter also removes dashboard access", async ({
    sessionToken,
}) => {
    await drizzle(env.DB, { schema })
        .update(schema.user)
        .set({ role: "admin" });
    const response = await SELF.fetch(`${BASE}/api/auth/sign-out`, {
        method: "POST",
        headers: { ...cookie(sessionToken), Origin: ORIGIN },
    });
    expect(response.status).toBe(200);
    expect(
        (await SELF.fetch(BASE + KPI, { headers: cookie(sessionToken) }))
            .status,
    ).toBe(401);
});

test.for([
    "/api/auth/get-session",
    KPI,
])("allows credentialed CORS only for dashboard origins: %s", async (path, {
    sessionToken,
}) => {
    const allowed = await SELF.fetch(BASE + path, {
        headers: { ...cookie(sessionToken), Origin: ORIGIN },
    });
    expect(allowed.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
    expect(allowed.headers.get("Access-Control-Allow-Credentials")).toBe(
        "true",
    );
    expect(allowed.headers.get("Vary")).toContain("Origin");
    const denied = await SELF.fetch(BASE + path, {
        headers: {
            ...cookie(sessionToken),
            Origin: "https://untrusted.pollinations.ai",
        },
    });
    expect(denied.headers.get("Access-Control-Allow-Credentials")).not.toBe(
        "true",
    );
});

test("permits the dashboard's sign-in preflight without broadening other API routes", async () => {
    const headers = {
        Origin: ORIGIN,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
    };
    const preflight = await SELF.fetch(`${BASE}/api/auth/sign-in/social`, {
        method: "OPTIONS",
        headers,
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
    expect(preflight.headers.get("Access-Control-Allow-Credentials")).toBe(
        "true",
    );
    const account = await SELF.fetch(`${BASE}/api/account/profile`, {
        method: "OPTIONS",
        headers,
    });
    expect(account.headers.get("Access-Control-Allow-Credentials")).not.toBe(
        "true",
    );
});

test("starts GitHub sign-in from the static dashboard", async () => {
    const response = await SELF.fetch(`${BASE}/api/auth/sign-in/social`, {
        method: "POST",
        headers: { Origin: ORIGIN, "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "github", callbackURL: `${ORIGIN}/` }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBe(
        "true",
    );
    const body = (await response.json()) as { url: string };
    expect(new URL(body.url).origin).toBe("https://github.com");
    expect(response.headers.get("Set-Cookie")).toBeTruthy();
});
