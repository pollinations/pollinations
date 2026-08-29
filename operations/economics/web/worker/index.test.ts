import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "./index";

const env = {
    ASSETS: {
        fetch: vi.fn().mockImplementation(() =>
            Promise.resolve(
                new Response("private asset", {
                    headers: { "Content-Type": "text/javascript" },
                }),
            ),
        ),
    },
    POLLINATIONS_AUTH_ALLOWED_EMAILS: "alice@example.com,bob@example.com",
    POLLINATIONS_AUTH_SESSION_SECRET:
        "test-session-secret-at-least-32-characters",
    POLLINATIONS_OAUTH_CLIENT_ID: "pk_internal_tools",
    TINYBIRD_API: "https://api.europe-west2.gcp.tinybird.co",
    TINYBIRD_ECONOMICS_READ_TOKEN: "test-token",
    TINYBIRD_POLLEN_PIPE: "economics_pollen_usage_snapshot_api",
};

function request(path: string, init?: RequestInit) {
    return worker.fetch(
        new Request(`https://economics.myceli.ai${path}`, init) as Parameters<
            typeof worker.fetch
        >[0],
        env,
    );
}

function upstream(options?: {
    email?: string;
    tinybird?: { data: unknown[] };
}) {
    const mock = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/oauth/token")) {
            return Response.json({ access_token: "sk_login" });
        }
        if (url.endsWith("/api/oauth/userinfo")) {
            return Response.json({
                sub: "user-1",
                email: options?.email || "alice@example.com",
            });
        }
        return Response.json(options?.tinybird || { data: [] });
    });
    vi.stubGlobal("fetch", mock);
    return mock;
}

function cookieFrom(response: Response, name: string) {
    return response.headers
        .get("Set-Cookie")
        ?.match(new RegExp(`${name}=([^;]+)`))?.[1];
}

async function authenticatedCookie(mock = upstream()) {
    const login = await request("/auth/login?return_to=%2F");
    const location = new URL(login.headers.get("Location") || "");
    const flow = cookieFrom(login, "pollinations_oauth_flow");
    const callback = await request(
        `/auth/callback?code=code-1&state=${location.searchParams.get("state")}`,
        { headers: { Cookie: `pollinations_oauth_flow=${flow}` } },
    );
    const session = cookieFrom(callback, "pollinations_session");
    if (!session) throw new Error("Expected OAuth session cookie");
    expect(mock).toHaveBeenCalledTimes(2);
    return `pollinations_session=${session}`;
}

afterEach(() => {
    vi.unstubAllGlobals();
    env.ASSETS.fetch.mockClear();
});

describe("economics Worker auth", () => {
    it("keeps health public", async () => {
        const response = await request("/api/health");

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({ ok: true });
    });

    it("redirects unauthenticated browsers to Pollinations login", async () => {
        const response = await request("/monthly?month=2026-08");

        expect(response.status).toBe(302);
        expect(response.headers.get("Location")).toBe(
            "https://economics.myceli.ai/auth/login?return_to=%2Fmonthly%3Fmonth%3D2026-08",
        );
        expect(env.ASSETS.fetch).not.toHaveBeenCalled();
    });

    it("rejects API reads without a session", async () => {
        const mock = upstream();

        const response = await request(
            "/api/pipes/economics_compute_ledger_api",
        );

        expect(response.status).toBe(401);
        await expect(response.json()).resolves.toEqual({
            error: "Unauthorized",
            code: "AUTH_REQUIRED",
        });
        expect(mock).not.toHaveBeenCalled();
    });

    it("creates a session for an allowlisted Pollinations account", async () => {
        const cookie = await authenticatedCookie();
        const response = await request("/assets/index.js", {
            headers: { Cookie: cookie },
        });

        expect(response.status).toBe(200);
        expect(response.headers.get("Cache-Control")).toBe("private, no-store");
        await expect(response.text()).resolves.toBe("private asset");
    });

    it("rejects a Pollinations account outside the allowlist", async () => {
        upstream({ email: "mallory@example.com" });
        const login = await request("/auth/login");
        const location = new URL(login.headers.get("Location") || "");
        const flow = cookieFrom(login, "pollinations_oauth_flow");

        const response = await request(
            `/auth/callback?code=code-2&state=${location.searchParams.get("state")}`,
            { headers: { Cookie: `pollinations_oauth_flow=${flow}` } },
        );

        expect(response.status).toBe(403);
    });

    it("rejects pipes outside the read allowlist", async () => {
        const mock = upstream();
        const cookie = await authenticatedCookie(mock);
        mock.mockClear();

        const response = await request("/api/pipes/secret_pipe", {
            headers: { Cookie: cookie },
        });

        expect(response.status).toBe(404);
        expect(mock).not.toHaveBeenCalled();
    });

    it("forwards an authenticated allowlisted pipe with the read token", async () => {
        const mock = upstream({
            tinybird: { data: [{ entry_id: "cloud-1" }] },
        });
        const cookie = await authenticatedCookie(mock);
        mock.mockClear();

        const response = await request(
            "/api/pipes/economics_compute_ledger_api",
            { headers: { Cookie: cookie } },
        );

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({
            data: [{ entry_id: "cloud-1" }],
        });
        expect(mock).toHaveBeenCalledWith(
            `${env.TINYBIRD_API}/v0/pipes/economics_compute_ledger_api.json`,
            {
                headers: {
                    Authorization: `Bearer ${env.TINYBIRD_ECONOMICS_READ_TOKEN}`,
                },
            },
        );
    });

    it("routes Pollen reads to the environment-specific upstream", async () => {
        const mock = upstream();
        const cookie = await authenticatedCookie(mock);
        mock.mockClear();

        const response = await request(
            "/api/pipes/economics_pollen_usage_api",
            { headers: { Cookie: cookie } },
        );

        expect(response.status).toBe(200);
        expect(mock).toHaveBeenCalledWith(
            `${env.TINYBIRD_API}/v0/pipes/economics_pollen_usage_snapshot_api.json`,
            {
                headers: {
                    Authorization: `Bearer ${env.TINYBIRD_ECONOMICS_READ_TOKEN}`,
                },
            },
        );
    });

    it("keeps local development assets available without a session", async () => {
        const response = await worker.fetch(
            new Request("http://127.0.0.1:4180/?fixtures=1") as Parameters<
                typeof worker.fetch
            >[0],
            env,
        );

        expect(response.status).toBe(200);
        expect(env.ASSETS.fetch).toHaveBeenCalledOnce();
    });
});
