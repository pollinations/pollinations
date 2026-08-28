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
    it("starts a zero-budget authorization-code flow with PKCE", async () => {
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
        expect(location.searchParams.get("budget")).toBe("0");
        expect(location.searchParams.get("code_challenge")).toMatch(
            /^[\w-]{43}$/,
        );
        expect(response.headers.get("Set-Cookie")).toContain(
            "HttpOnly; Secure; SameSite=Lax",
        );
    });

    it("exchanges the code and creates an allowlisted session", async () => {
        const upstream = vi
            .fn()
            .mockResolvedValueOnce(Response.json({ access_token: "sk_login" }))
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
    });

    it("denies users outside the email allowlist", async () => {
        const upstream = vi
            .fn()
            .mockResolvedValueOnce(Response.json({ access_token: "sk_login" }))
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
});
