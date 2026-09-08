import { env, SELF } from "cloudflare:test";
import * as schema from "@shared/db/better-auth.ts";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, expect, vi } from "vitest";
import economicsApp from "../../operations/economics/web/worker/index";
import kpiApp from "../../operations/kpi/worker/index";
import { createObservabilityApp } from "../../operations/observability/src/app";
import { createPollinationsAuth } from "../../packages/auth/src/server";
import { test } from "./fixtures.ts";

afterEach(() => vi.restoreAllMocks());

const ENTER = "http://localhost:3000";
const forward = vi.fn(async (request: Request) =>
    Response.json({
        identity: request.headers.get("X-WEBAUTH-USER"),
        role: request.headers.get("X-WEBAUTH-ROLE"),
        bearer: request.headers.get("Authorization"),
        cookie: request.headers.get("Cookie"),
        extraIdentity: request.headers.get("X-WEBAUTH-EMAIL"),
    }),
);
const observabilityApp = createObservabilityApp(forward);
const apps = [
    {
        name: "KPI",
        origin: "https://kpi.pollinations.ai",
        clientId: "pk_Bxny9FSNDpousKqW",
        app: kpiApp,
        path: "/api/kpi/registrations",
    },
    {
        name: "Economics",
        origin: "https://economics.pollinations.ai",
        clientId: "pk_LBL0KnkHI6AZopCc",
        app: economicsApp,
        path: "/api/economics/pipes/economics_bank_ledger_api",
    },
    {
        name: "Observability",
        origin: "https://observability.pollinations.ai",
        clientId: "pk_vVa38CFt1R1gGScW",
        app: observabilityApp,
        path: "/grafana/api/user",
    },
].map((app) => ({
    ...app,
    config: {
        clientId: app.clientId,
        sessionSecret: `test-only-${app.name}-signing-secret-at-least-32-characters`,
        baseUrl: ENTER,
        fetch: ((input, init) =>
            SELF.fetch(new Request(input, init))) as typeof fetch,
    },
}));
function bindings(app: (typeof apps)[number]) {
    return {
        POLLINATIONS_AUTH_BASE_URL: ENTER,
        POLLINATIONS_OAUTH_CLIENT_ID: app.clientId,
        POLLINATIONS_AUTH_SESSION_SECRET: app.config.sessionSecret,
        TINYBIRD_INGEST_URL: "http://localhost:7181",
        TINYBIRD_READ_TOKEN: "test_tinybird_read_token",
        TINYBIRD_ECONOMICS_READ_TOKEN: "test_economics_read_token",
        TINYBIRD_POLLEN_PIPE: "economics_pollen_usage_snapshot_api",
        ASSETS: { fetch },
    };
}
function cookie(response: Response, name: string) {
    const value = response.headers
        .getSetCookie()
        .find((value) => value.startsWith(`${name}=`));
    if (!value) throw new Error(`Missing ${name}`);
    return value.split(";")[0];
}
async function login(app: (typeof apps)[number], enterCookie: string) {
    const auth = createPollinationsAuth(app.config);
    const login = await auth.handle(new Request(`${app.origin}/auth/login`));
    if (!login) throw new Error("Missing login response");
    const authorization = await SELF.fetch(
        login.headers.get("Location") || "",
        {
            redirect: "manual",
            headers: { Cookie: enterCookie, Accept: "text/html" },
        },
    );
    expect(authorization.status).toBe(302);
    const callback = await auth.handle(
        new Request(authorization.headers.get("Location") || "", {
            headers: { Cookie: cookie(login, "pollinations_oauth_flow") },
        }),
    );
    if (!callback) throw new Error("Missing callback response");
    return callback;
}

test("all three apps use real identity OAuth and keep sign-out independent", async ({
    sessionToken,
    mocks,
}) => {
    // This is the isolated cloudflare:test database and its mocked GitHub user.
    expect(env.ENVIRONMENT).toBe("test");
    const enterCookie = `better-auth.session_token=${sessionToken}`;
    const initial = await SELF.fetch(`${ENTER}/api/auth/get-session`, {
        headers: { Cookie: enterCookie },
    });
    const { user } = (await initial.json()) as {
        user: { id: string; email: string };
    };
    expect(user.email).toBe("test@example.com");
    await drizzle(env.DB, { schema })
        .update(schema.user)
        .set({ role: "admin" })
        .where(
            and(
                eq(schema.user.id, user.id),
                eq(schema.user.email, "test@example.com"),
            ),
        );
    mocks.tinybird.handlerMap["localhost:7181"] = async () =>
        Response.json({ data: [] });
    await mocks.enable("tinybird");
    const upstream = globalThis.fetch;
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
        const request = new Request(input, init);
        return request.url.startsWith(`${ENTER}/api/auth/`)
            ? SELF.fetch(request)
            : upstream(input, init);
    });
    const sessions = new Map<string, string>();
    for (const app of apps) {
        const response = await login(app, enterCookie);
        expect(response.status).toBe(302);
        sessions.set(app.name, cookie(response, "pollinations_session"));
    }
    for (const app of apps) {
        const appCookie = sessions.get(app.name) || "";
        const response = await app.app.request(
            app.origin + app.path,
            { headers: { Cookie: appCookie } },
            bindings(app),
        );
        expect(response.status).toBe(200);
        expect(response.headers.get("Cache-Control")).toBe("private, no-store");
        // A valid session from a different app is not accepted.
        for (const other of apps.filter((other) => other.name !== app.name)) {
            const denied = await app.app.request(
                app.origin + app.path,
                { headers: { Cookie: sessions.get(other.name) || "" } },
                bindings(app),
            );
            expect(denied.status).toBe(401);
        }
        const logout = await app.app.request(
            `${app.origin}/auth/logout`,
            {
                method: "POST",
                headers: { Cookie: appCookie, Origin: app.origin },
            },
            bindings(app),
        );
        expect(logout.status).toBe(204);
        const signedOut = await app.app.request(
            `${app.origin}/auth/session`,
            { headers: { Cookie: cookie(logout, "pollinations_session") } },
            bindings(app),
        );
        expect(signedOut.status).toBe(401);
        expect(logout.headers.get("Set-Cookie")).not.toContain("better-auth");
        for (const other of apps.filter((other) => other.name !== app.name)) {
            const retained = await other.app.request(
                `${other.origin}/auth/session`,
                { headers: { Cookie: sessions.get(other.name) || "" } },
                bindings(other),
            );
            expect(retained.status).toBe(200);
        }
    }
    const retainedEnter = await SELF.fetch(`${ENTER}/api/auth/get-session`, {
        headers: { Cookie: enterCookie },
    });
    expect(await retainedEnter.json()).toMatchObject({ user: { id: user.id } });

    const observability = apps[2];
    const proxied = await observability.app.request(
        observability.origin + observability.path,
        {
            headers: {
                Cookie: `${sessions.get(observability.name)}; grafana_session=untrusted`,
                Authorization: "Bearer untrusted",
                "X-WEBAUTH-USER": "admin",
                "X-WEBAUTH-ROLE": "Admin",
                "X-WEBAUTH-EMAIL": "spoof@example.com",
            },
        },
        bindings(observability),
    );
    expect(await proxied.json()).toEqual({
        identity: user.id,
        role: "Editor",
        bearer: null,
        cookie: null,
        extraIdentity: null,
    });
    expect(proxied.headers.has("Set-Cookie")).toBe(false);
    expect(proxied.headers.get("Content-Security-Policy")).toContain(
        "frame-ancestors 'self'",
    );

    const pair = new WebSocketPair();
    pair[1].accept();
    forward.mockResolvedValueOnce(
        new Response(null, { status: 101, webSocket: pair[0] }),
    );
    const upgraded = await observability.app.request(
        `${observability.origin}/grafana/api/live/ws`,
        {
            headers: {
                Cookie: sessions.get(observability.name) || "",
                Upgrade: "websocket",
            },
        },
        bindings(observability),
    );
    expect(upgraded.status).toBe(101);
    expect(upgraded.webSocket).toBeTruthy();
    upgraded.webSocket?.accept();
    upgraded.webSocket?.close();
    pair[1].close();

    const economics = apps[1];
    for (const pipe of [
        "economics_bank_ledger_api",
        "economics_vendor_ledger_api",
        "economics_pollen_usage_api",
        "economics_private_config_api",
        "economics_revenue_share_api",
        "economics_stripe_sales_api",
        "economics_user_balances_api",
    ]) {
        const response = await economics.app.request(
            `${economics.origin}/api/economics/pipes/${pipe}`,
            { headers: { Cookie: sessions.get(economics.name) || "" } },
            bindings(economics),
        );
        expect(response.status).toBe(200);
        expect(vi.mocked(fetch)).toHaveBeenCalledWith(
            `http://localhost:7181/v0/pipes/${pipe === "economics_pollen_usage_api" ? "economics_pollen_usage_snapshot_api" : pipe}.json`,
            { headers: { Authorization: "Bearer test_economics_read_token" } },
        );
    }
    const unknown = await economics.app.request(
        `${economics.origin}/api/economics/pipes/private_users`,
        { headers: { Cookie: sessions.get(economics.name) || "" } },
        bindings(economics),
    );
    expect(unknown.status).toBe(404);
    for (const pipe of ["", "typo", "../private"]) {
        const denied = await economics.app.request(
            `${economics.origin}/api/economics/pipes/economics_pollen_usage_api`,
            { headers: { Cookie: sessions.get(economics.name) || "" } },
            { ...bindings(economics), TINYBIRD_POLLEN_PIPE: pipe },
        );
        expect(denied.status).toBe(503);
        expect(await denied.text()).toContain("TINYBIRD_POLLEN_PIPE");
    }
    const assetFetch = vi.fn(
        async () =>
            new Response("private registry", {
                headers: { "Cache-Control": "public, max-age=31536000" },
            }),
    );
    const privateBindings = {
        ...bindings(economics),
        ASSETS: { fetch: assetFetch as typeof fetch },
    };
    const deniedAsset = await economics.app.request(
        `${economics.origin}/private/provider-registry-hash.js`,
        {},
        privateBindings,
    );
    expect(deniedAsset.status).toBe(401);
    expect(assetFetch).not.toHaveBeenCalled();
    const allowedAsset = await economics.app.request(
        `${economics.origin}/private/provider-registry-hash.js`,
        { headers: { Cookie: sessions.get(economics.name) || "" } },
        privateBindings,
    );
    expect(allowedAsset.status).toBe(200);
    expect(allowedAsset.headers.get("Cache-Control")).toBe("private, no-store");
    await drizzle(env.DB, { schema })
        .update(schema.user)
        .set({ banned: true })
        .where(
            and(
                eq(schema.user.id, user.id),
                eq(schema.user.email, "test@example.com"),
            ),
        );
    for (const app of apps) {
        const denied = await app.app.request(
            app.origin + app.path,
            { headers: { Cookie: sessions.get(app.name) || "" } },
            bindings(app),
        );
        expect(denied.status).toBe(401);
    }
});

test("non-admin identities cannot create any dashboard session", async ({
    sessionToken,
}) => {
    for (const app of apps) {
        const response = await login(
            app,
            `better-auth.session_token=${sessionToken}`,
        );
        expect(response.status).toBe(302);
        expect(response.headers.get("Location")).toContain(
            "auth_error=admin_required",
        );
        expect(response.headers.get("Set-Cookie")).not.toContain(
            "pollinations_session=",
        );
    }
});

test("all dashboard backends reject Enter cookies, API keys and forged Grafana headers", async ({
    sessionToken,
    apiKey,
}) => {
    forward.mockClear();
    for (const app of apps) {
        for (const headers of [
            { Cookie: `better-auth.session_token=${sessionToken}` },
            { Authorization: `Bearer ${apiKey}` },
            {
                "X-WEBAUTH-USER": "admin",
                "X-WEBAUTH-ROLE": "Admin",
                Cookie: "grafana_session=untrusted",
            },
        ]) {
            const response = await app.app.request(
                app.origin + app.path,
                { headers },
                bindings(app),
            );
            expect(response.status).toBe(401);
        }
    }
    expect(forward).not.toHaveBeenCalled();
});
