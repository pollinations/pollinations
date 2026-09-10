import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthUnavailableError, createPollinationsAuth } from "../src/server";

const config = {
    clientId: "pk_internal_tools",
    sessionSecret: "test-session-secret-at-least-32-characters",
};

function cookieFrom(response: Response, name: string) {
    return response.headers
        .get("Set-Cookie")
        ?.match(new RegExp(`${name}=([^;]+)`))?.[1];
}

function flowFromCookie(value: string) {
    const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    return JSON.parse(atob(padded)) as {
        returnTo: string;
        exp?: number;
        checkedAt?: number;
    };
}

async function begin(auth: ReturnType<typeof createPollinationsAuth>) {
    const response = await auth.handle(
        new Request(
            "https://kpi.pollinations.ai/auth/login?return_to=%2Fweekly%3Fx%3D1",
        ),
    );
    if (!response) throw new Error("Expected login response");
    const location = new URL(response.headers.get("Location") || "");
    const flow = cookieFrom(response, "pollinations_oauth_flow");
    if (!flow) throw new Error("Expected flow cookie");
    return { response, location, flow };
}

function userUpstream() {
    return vi.fn(async (input: RequestInfo | URL) =>
        String(input).endsWith("/api/auth/oauth2/token")
            ? Response.json({ access_token: "oauth_login" })
            : Response.json({
                  sub: "user-1",
                  email: "alice@example.com",
                  role: "admin",
                  preferred_username: "alice",
              }),
    );
}

async function authenticatedSession(
    auth: ReturnType<typeof createPollinationsAuth>,
) {
    const { location, flow } = await begin(auth);
    const callback = await auth.handle(
        new Request(
            `https://kpi.pollinations.ai/auth/callback?code=code-session&state=${location.searchParams.get("state")}`,
            { headers: { Cookie: `pollinations_oauth_flow=${flow}` } },
        ),
    );
    if (!callback) throw new Error("Expected callback response");
    const session = cookieFrom(callback, "pollinations_session");
    if (!session) throw new Error("Expected session cookie");
    return session;
}

afterEach(() => {
    vi.useRealTimers();
});

describe("Pollinations OAuth", () => {
    it("starts an identity-only authorization-code flow with PKCE", async () => {
        const auth = createPollinationsAuth(config);
        const { response, location, flow } = await begin(auth);

        expect(response.status).toBe(302);
        expect(location.origin).toBe("https://enter.pollinations.ai");
        expect(location.pathname).toBe("/api/auth/oauth2/authorize");
        expect(location.searchParams.get("response_type")).toBe("code");
        expect(location.searchParams.get("client_id")).toBe(config.clientId);
        expect(location.searchParams.get("redirect_uri")).toBe(
            "https://kpi.pollinations.ai/auth/callback",
        );
        expect(location.searchParams.get("scope")).toBe("openid profile email");
        expect(location.searchParams.has("budget")).toBe(false);
        expect(location.searchParams.has("expiry")).toBe(false);
        expect(location.searchParams.has("models")).toBe(false);
        expect(location.searchParams.get("code_challenge")).toMatch(
            /^[\w-]{43}$/,
        );
        expect(response.headers.get("Set-Cookie")).toContain(
            "HttpOnly; Secure; SameSite=Lax",
        );
        expect(flowFromCookie(flow).returnTo).toBe(
            "https://kpi.pollinations.ai/weekly?x=1",
        );
    });

    it("supports a local OAuth issuer", async () => {
        const auth = createPollinationsAuth({
            ...config,
            baseUrl: "http://127.0.0.1:3000",
        });
        const response = await auth.handle(
            new Request("http://127.0.0.1:4280/auth/login"),
        );
        const location = new URL(response?.headers.get("Location") || "");

        expect(location.origin).toBe("http://127.0.0.1:3000");
        expect(location.pathname).toBe("/api/auth/oauth2/authorize");
    });

    it("rejects return paths that resolve outside the app origin", async () => {
        const auth = createPollinationsAuth({
            ...config,
            fetch: userUpstream(),
        });
        const maliciousPaths = [
            String.raw`/\evil.example`,
            String.raw`/\/evil.example`,
            "//evil.example",
            "https://evil.example/",
            "/..//evil.example",
            "/foo/../..//evil.example",
        ];

        for (const returnTo of maliciousPaths) {
            const appOrigin = "https://kpi.pollinations.ai";
            const loginUrl = new URL(`${appOrigin}/auth/login`);
            loginUrl.searchParams.set("return_to", returnTo);
            const login = await auth.handle(new Request(loginUrl));
            if (!login) throw new Error("Expected login response");
            const authorizeUrl = new URL(login.headers.get("Location") || "");
            const flow = cookieFrom(login, "pollinations_oauth_flow");
            if (!flow) throw new Error("Expected flow cookie");
            expect(new URL(flowFromCookie(flow).returnTo).origin).toBe(
                appOrigin,
            );
            const callback = await auth.handle(
                new Request(
                    `https://kpi.pollinations.ai/auth/callback?code=code-return&state=${authorizeUrl.searchParams.get("state")}`,
                    {
                        headers: {
                            Cookie: `pollinations_oauth_flow=${flow}`,
                        },
                    },
                ),
            );

            const resolved = new URL(returnTo, appOrigin);
            expect(callback?.headers.get("Location")).toBe(
                resolved.origin === appOrigin
                    ? resolved.toString()
                    : `${appOrigin}/`,
            );
        }
    });

    it("exchanges the code and creates a dashboard session", async () => {
        const upstream = userUpstream()
            .mockResolvedValueOnce(
                Response.json({ access_token: "oauth_login" }),
            )
            .mockResolvedValueOnce(
                Response.json({
                    sub: "user-1",
                    email: "ALICE@example.com",
                    role: "admin",
                    preferred_username: "alice",
                }),
            );
        const auth = createPollinationsAuth({ ...config, fetch: upstream });
        const { location, flow } = await begin(auth);
        const callback = await auth.handle(
            new Request(
                `https://kpi.pollinations.ai/auth/callback?code=code-1&state=${location.searchParams.get("state")}`,
                { headers: { Cookie: `pollinations_oauth_flow=${flow}` } },
            ),
        );
        if (!callback) throw new Error("Expected callback response");

        expect(callback.status).toBe(302);
        expect(callback.headers.get("Location")).toBe(
            "https://kpi.pollinations.ai/weekly?x=1",
        );
        const session = cookieFrom(callback, "pollinations_session");
        expect(session).toBeTruthy();
        expect(upstream).toHaveBeenCalledTimes(2);
        expect(upstream.mock.calls[1]?.[0]).toBe(
            "https://enter.pollinations.ai/api/auth/oauth2/userinfo",
        );

        const user = await auth.getUser(
            new Request("https://kpi.pollinations.ai/api/kpi/wau", {
                headers: { Cookie: `pollinations_session=${session}` },
            }),
        );
        expect(user).toEqual({
            sub: "user-1",
            email: "alice@example.com",
            preferred_username: "alice",
        });

        const sessionResponse = await auth.handle(
            new Request("https://kpi.pollinations.ai/auth/session", {
                headers: { Cookie: `pollinations_session=${session}` },
            }),
        );
        expect(sessionResponse?.status).toBe(200);
        expect(await sessionResponse?.json()).toEqual({ user });
        expect(sessionResponse?.headers.get("Cache-Control")).toBe("no-store");
    });

    it("does not create a dashboard session for a non-admin", async () => {
        const upstream = userUpstream()
            .mockResolvedValueOnce(
                Response.json({ access_token: "oauth_login" }),
            )
            .mockResolvedValueOnce(
                Response.json({
                    sub: "user-2",
                    email: "user@example.com",
                    role: "user",
                }),
            );
        const auth = createPollinationsAuth({ ...config, fetch: upstream });
        const { location, flow } = await begin(auth);
        const response = await auth.handle(
            new Request(
                `https://kpi.pollinations.ai/auth/callback?code=code-2&state=${location.searchParams.get("state")}`,
                { headers: { Cookie: `pollinations_oauth_flow=${flow}` } },
            ),
        );

        expect(response?.status).toBe(302);
        expect(response?.headers.get("Location")).toBe(
            "https://kpi.pollinations.ai/?auth_error=admin_required",
        );
        expect(cookieFrom(response as Response, "pollinations_session")).toBe(
            undefined,
        );
    });

    it("rejects a mismatched OAuth state before the token exchange", async () => {
        const upstream = vi.fn();
        const auth = createPollinationsAuth({ ...config, fetch: upstream });
        const { flow } = await begin(auth);
        const response = await auth.handle(
            new Request(
                "https://kpi.pollinations.ai/auth/callback?code=code-3&state=wrong",
                { headers: { Cookie: `pollinations_oauth_flow=${flow}` } },
            ),
        );

        expect(response?.status).toBe(302);
        expect(upstream).not.toHaveBeenCalled();
    });

    it("returns a canceled sign-in to its destination without an error or token exchange", async () => {
        const upstream = vi.fn();
        const auth = createPollinationsAuth({ ...config, fetch: upstream });
        const { location, flow } = await begin(auth);
        const response = await auth.handle(
            new Request(
                `https://kpi.pollinations.ai/auth/callback?error=access_denied&state=${location.searchParams.get("state")}`,
                { headers: { Cookie: `pollinations_oauth_flow=${flow}` } },
            ),
        );

        expect(response?.status).toBe(302);
        expect(response?.headers.get("Location")).toBe(
            "https://kpi.pollinations.ai/weekly?x=1&signed_out=1",
        );
        expect(response?.headers.get("Set-Cookie")).toContain("Max-Age=0");
        expect(upstream).not.toHaveBeenCalled();
    });

    it("rejects a tampered session signature", async () => {
        const auth = createPollinationsAuth({
            ...config,
            fetch: userUpstream(),
        });
        const session = await authenticatedSession(auth);

        await expect(
            auth.getUser(
                new Request("https://kpi.pollinations.ai/api/private", {
                    headers: {
                        Cookie: `pollinations_session=${session}x`,
                    },
                }),
            ),
        ).resolves.toBeNull();
    });

    it("rejects an expired session", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-08-29T10:00:00Z"));
        const auth = createPollinationsAuth({
            ...config,
            fetch: userUpstream(),
        });
        const session = await authenticatedSession(auth);
        vi.advanceTimersByTime(43_201_000);

        await expect(
            auth.getUser(
                new Request("https://kpi.pollinations.ai/api/private", {
                    headers: { Cookie: `pollinations_session=${session}` },
                }),
            ),
        ).resolves.toBeNull();
    });

    it("rejects a valid session on a different origin", async () => {
        const auth = createPollinationsAuth({
            ...config,
            fetch: userUpstream(),
        });
        const session = await authenticatedSession(auth);

        await expect(
            auth.getUser(
                new Request("https://economics.pollinations.ai/api/private", {
                    headers: { Cookie: `pollinations_session=${session}` },
                }),
            ),
        ).resolves.toBeNull();
    });

    it("rejects logout navigations and cross-origin requests", async () => {
        const auth = createPollinationsAuth(config);
        for (const [method, origin, status] of [
            ["GET", "https://kpi.pollinations.ai", 405],
            ["POST", "https://economics.pollinations.ai", 403],
            ["POST", "", 403],
        ] as const) {
            const response = await auth.handle(
                new Request("https://kpi.pollinations.ai/auth/logout", {
                    method,
                    headers: { Origin: origin },
                }),
            );
            expect(response?.status).toBe(status);
            expect(response?.headers.has("Set-Cookie")).toBe(false);
        }
    });

    it("clears the session without redirecting into automatic login", async () => {
        const auth = createPollinationsAuth(config);
        const response = await auth.handle(
            new Request("https://kpi.pollinations.ai/auth/logout", {
                method: "POST",
                headers: { Origin: "https://kpi.pollinations.ai" },
            }),
        );

        expect(response?.status).toBe(204);
        expect(response?.headers.has("Location")).toBe(false);
        expect(response?.headers.get("Cache-Control")).toBe("no-store");
        expect(await response?.text()).toBe("");
        expect(response?.headers.get("Set-Cookie")).toContain(
            "pollinations_session=;",
        );
        expect(response?.headers.get("Set-Cookie")).toContain("Max-Age=0");
    });

    it("clears only this dashboard's port-specific session on local logout", async () => {
        const auth = createPollinationsAuth(config);
        const response = await auth.handle(
            new Request("http://localhost:3456/auth/logout", {
                method: "POST",
                headers: { Origin: "http://localhost:3456" },
            }),
        );
        expect(response?.status).toBe(204);
        expect(response?.headers.has("Location")).toBe(false);
        expect(response?.headers.get("Set-Cookie")).toContain(
            "pollinations_session_3456=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0",
        );
    });

    it("isolates local cookies by port", async () => {
        const upstream = userUpstream()
            .mockResolvedValueOnce(
                Response.json({ access_token: "oauth_login" }),
            )
            .mockResolvedValueOnce(
                Response.json({
                    sub: "user-1",
                    email: "alice@example.com",
                    role: "admin",
                }),
            );
        const auth = createPollinationsAuth({ ...config, fetch: upstream });
        const login = await auth.handle(
            new Request("http://127.0.0.1:4280/auth/login"),
        );
        if (!login) throw new Error("Expected local login response");
        const location = new URL(login.headers.get("Location") || "");
        const flow = cookieFrom(login, "pollinations_oauth_flow_4280");
        const callback = await auth.handle(
            new Request(
                `http://127.0.0.1:4280/auth/callback?code=local-code&state=${location.searchParams.get("state")}`,
                {
                    headers: {
                        Cookie: `pollinations_oauth_flow_4280=${flow}`,
                    },
                },
            ),
        );
        if (!callback) throw new Error("Expected local callback response");
        const session = cookieFrom(callback, "pollinations_session_4280");
        const logout = await auth.handle(
            new Request("http://127.0.0.1:4280/auth/logout", {
                method: "POST",
                headers: { Origin: "http://127.0.0.1:4280" },
            }),
        );

        expect(login.headers.get("Set-Cookie")).toContain(
            "pollinations_oauth_flow_4280=",
        );
        expect(session).toBeTruthy();
        await expect(
            auth.getUser(
                new Request("http://127.0.0.1:4280/api/private", {
                    headers: {
                        Cookie: `pollinations_session_4280=${session}`,
                    },
                }),
            ),
        ).resolves.toMatchObject({ email: "alice@example.com" });
        await expect(
            auth.getUser(
                new Request("http://127.0.0.1:4281/api/private", {
                    headers: {
                        Cookie: `pollinations_session_4280=${session}`,
                    },
                }),
            ),
        ).resolves.toBeNull();
        expect(logout?.headers.get("Set-Cookie")).toContain(
            "pollinations_session_4280=;",
        );
    });

    it("does not expose a session without a valid cookie", async () => {
        const auth = createPollinationsAuth(config);
        const response = await auth.handle(
            new Request("https://kpi.pollinations.ai/auth/session"),
        );

        expect(response?.status).toBe(401);
        expect(await response?.json()).toEqual({ user: null });
    });
});

it("encrypts the identity token and rejects a session after admin access is revoked", async () => {
    const upstream = userUpstream();
    const auth = createPollinationsAuth({ ...config, fetch: upstream });
    const session = await authenticatedSession(auth);
    const payload = JSON.stringify(flowFromCookie(session.split(".")[0]));
    expect(payload).not.toContain("oauth_login");
    const request = new Request("https://kpi.pollinations.ai/api/private", {
        headers: { Cookie: `pollinations_session=${session}` },
    });
    expect(await auth.getUser(request)).toMatchObject({ sub: "user-1" });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 60_000);
    upstream.mockResolvedValueOnce(
        Response.json({
            sub: "user-1",
            email: "alice@example.com",
            role: "user",
        }),
    );
    expect(await auth.getUser(request)).toBeNull();
    upstream.mockResolvedValueOnce(new Response(null, { status: 401 }));
    expect(await auth.getUser(request)).toBeNull();
});

it("reuses a checked cookie for 60 seconds and renews it without extending expiry", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const upstream = userUpstream();
    const auth = createPollinationsAuth({ ...config, fetch: upstream });
    const session = await authenticatedSession(auth);
    const original = flowFromCookie(session.split(".")[0]);
    const request = (value: string) =>
        new Request("https://kpi.pollinations.ai/auth/session", {
            headers: { Cookie: `pollinations_session=${value}` },
        });
    upstream.mockClear();
    vi.setSystemTime(Date.now() + 59_000);
    for (let i = 0; i < 50; i++)
        expect(await auth.getUser(request(session))).toMatchObject({
            sub: "user-1",
        });
    expect(upstream).not.toHaveBeenCalled();
    vi.setSystemTime(Date.now() + 1_000);
    const refreshed = await auth.handle(request(session));
    expect(refreshed?.status).toBe(200);
    if (!refreshed) throw new Error("Expected session response");
    const renewed = cookieFrom(refreshed, "pollinations_session");
    if (!renewed) throw new Error("Expected refreshed session cookie");
    const payload = flowFromCookie(renewed.split(".")[0]);
    expect(payload).toMatchObject({
        exp: original.exp,
        checkedAt: Math.floor(Date.now() / 1000),
    });
    expect(upstream).toHaveBeenCalledOnce();
    // A new Worker instance uses the same refreshed cookie without a lookup.
    const anotherWorker = createPollinationsAuth({
        ...config,
        fetch: upstream,
    });
    for (let i = 0; i < 50; i++)
        expect(await anotherWorker.getUser(request(renewed))).toMatchObject({
            sub: "user-1",
        });
    expect(upstream).toHaveBeenCalledOnce();
});

it.each([
    401,
    403,
    500,
    503,
    "network",
    "timeout",
])("distinguishes UserInfo failure %s from revoked access", async (failure) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const upstream = userUpstream();
    const auth = createPollinationsAuth({ ...config, fetch: upstream });
    const session = await authenticatedSession(auth);
    vi.setSystemTime(Date.now() + 60_000);
    if (typeof failure === "string")
        upstream.mockRejectedValueOnce(new Error(String(failure)));
    else
        upstream.mockResolvedValueOnce(new Response(null, { status: failure }));
    const request = new Request("https://kpi.pollinations.ai/auth/session", {
        headers: { Cookie: `pollinations_session=${session}` },
    });
    const result = await auth.handle(request);
    expect(result?.status).toBe(failure === 401 || failure === 403 ? 401 : 503);
    expect(result?.headers.get("Set-Cookie")).toBeNull();
    if (result?.status === 503) {
        expect(await result.json()).toEqual({
            error: new AuthUnavailableError().message,
        });
        // The same cookie works when Enter recovers.
        expect((await auth.handle(request))?.status).toBe(200);
    }
});

it("shows a retryable login error when UserInfo is temporarily unavailable", async () => {
    const upstream = userUpstream()
        .mockResolvedValueOnce(
            Response.json({ access_token: "test-only-token" }),
        )
        .mockRejectedValueOnce(new Error("network"));
    const auth = createPollinationsAuth({ ...config, fetch: upstream });
    const { location, flow } = await begin(auth);
    const result = await auth.handle(
        new Request(
            `https://kpi.pollinations.ai/auth/callback?code=test-code&state=${location.searchParams.get("state")}`,
            { headers: { Cookie: `pollinations_oauth_flow=${flow}` } },
        ),
    );
    expect(
        new URL(result?.headers.get("Location") || "").searchParams.get(
            "auth_error",
        ),
    ).toBe("unavailable");
});

it("coalesces simultaneous rechecks of a stale cookie across auth instances", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const upstream = userUpstream();
    const auth = createPollinationsAuth({ ...config, fetch: upstream });
    const session = await authenticatedSession(auth);
    vi.setSystemTime(Date.now() + 60_000);
    let resolve!: (response: Response) => void;
    upstream.mockClear().mockImplementationOnce(
        () =>
            new Promise<Response>((done) => {
                resolve = done;
            }),
    );
    const request = new Request("https://kpi.pollinations.ai/api/private", {
        headers: { Cookie: `pollinations_session=${session}` },
    });
    const requests = Array.from({ length: 20 }, () =>
        createPollinationsAuth({ ...config, fetch: upstream }).getUser(request),
    );
    await vi.waitFor(() => expect(upstream).toHaveBeenCalledOnce());
    resolve(
        Response.json({
            sub: "user-1",
            email: "alice@example.com",
            role: "admin",
        }),
    );
    expect(await Promise.all(requests)).toHaveLength(20);
    expect(upstream).toHaveBeenCalledOnce();
});
