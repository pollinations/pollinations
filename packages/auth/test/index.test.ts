import { describe, expect, it, vi } from "vitest";
import { createPollinationsAuth } from "../src/index";

const config = {
    clientId: "pk_internal_tools",
    sessionSecret: "test-session-secret-at-least-32-characters",
    allowedEmails: "alice@example.com, BOB@example.com ",
};

function cookieFrom(response: Response, name: string) {
    return response.headers
        .get("Set-Cookie")
        ?.match(new RegExp(`${name}=([^;]+)`))?.[1];
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

describe("Pollinations OAuth", () => {
    it("starts an identity-only authorization-code flow with PKCE", async () => {
        const auth = createPollinationsAuth(config);
        const { response, location } = await begin(auth);

        expect(response.status).toBe(302);
        expect(location.origin).toBe("https://enter.pollinations.ai");
        expect(location.pathname).toBe("/authorize");
        expect(location.searchParams.get("response_type")).toBe("code");
        expect(location.searchParams.get("client_id")).toBe(config.clientId);
        expect(location.searchParams.get("redirect_uri")).toBe(
            "https://kpi.pollinations.ai/auth/callback",
        );
        expect(location.searchParams.get("scope")).toBe("profile");
        expect(location.searchParams.get("purpose")).toBe("login");
        expect(location.searchParams.has("budget")).toBe(false);
        expect(location.searchParams.has("expiry")).toBe(false);
        expect(location.searchParams.has("models")).toBe(false);
        expect(location.searchParams.get("code_challenge")).toMatch(
            /^[\w-]{43}$/,
        );
        expect(response.headers.get("Set-Cookie")).toContain(
            "HttpOnly; Secure; SameSite=Lax",
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
        expect(location.pathname).toBe("/authorize");
        expect(location.searchParams.get("purpose")).toBe("login");
    });

    it("exchanges the code and creates an allowlisted session", async () => {
        const upstream = vi
            .fn()
            .mockResolvedValueOnce(
                Response.json({ access_token: "oauth_login" }),
            )
            .mockResolvedValueOnce(
                Response.json({
                    sub: "user-1",
                    email: "ALICE@example.com",
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
            "https://enter.pollinations.ai/api/oauth/userinfo",
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

    it("denies users outside the email allowlist", async () => {
        const upstream = vi
            .fn()
            .mockResolvedValueOnce(
                Response.json({ access_token: "oauth_login" }),
            )
            .mockResolvedValueOnce(
                Response.json({ sub: "user-2", email: "mallory@example.com" }),
            );
        const auth = createPollinationsAuth({ ...config, fetch: upstream });
        const { location, flow } = await begin(auth);
        const response = await auth.handle(
            new Request(
                `https://kpi.pollinations.ai/auth/callback?code=code-2&state=${location.searchParams.get("state")}`,
                { headers: { Cookie: `pollinations_oauth_flow=${flow}` } },
            ),
        );

        expect(response?.status).toBe(403);
        expect(
            cookieFrom(response as Response, "pollinations_session"),
        ).toBeUndefined();
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

        expect(response?.status).toBe(400);
        expect(upstream).not.toHaveBeenCalled();
    });

    it("clears the session on logout", async () => {
        const auth = createPollinationsAuth(config);
        const response = await auth.handle(
            new Request("https://kpi.pollinations.ai/auth/logout"),
        );

        expect(response?.status).toBe(302);
        expect(response?.headers.get("Set-Cookie")).toContain(
            "pollinations_session=;",
        );
        expect(response?.headers.get("Set-Cookie")).toContain("Max-Age=0");
    });

    it("isolates local cookies by port", async () => {
        const upstream = vi
            .fn()
            .mockResolvedValueOnce(
                Response.json({ access_token: "oauth_login" }),
            )
            .mockResolvedValueOnce(
                Response.json({ sub: "user-1", email: "alice@example.com" }),
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
            new Request("http://127.0.0.1:4280/auth/logout"),
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
