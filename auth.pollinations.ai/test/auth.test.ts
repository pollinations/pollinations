import { SELF } from "cloudflare:test";
import { afterEach, beforeEach, expect, test } from "vitest";
import { setupFetchMock, teardownFetchMock } from "./mocks/fetch";
import { createGithubMockHandlers } from "./mocks/github";
import { createPolarMockHandlers } from "./mocks/polar";

const mockHandlers = {
    ...createGithubMockHandlers(),
    ...createPolarMockHandlers(),
};

beforeEach(() => setupFetchMock(mockHandlers));
afterEach(() => teardownFetchMock());

type SignupData = {
    url: string;
};

type SessionData = {
    user: {
        name: string;
        email: string;
    };
    session: unknown;
};

test("complete signup and session creation", async () => {
    const signupUrl = new URL(
        "http://localhost:3000/api/v1/auth/sign-in/social",
    );

    const signupResponse = await SELF.fetch(signupUrl.toString(), {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            provider: "github",
        }),
    });

    expect(signupResponse.status).toBe(200);

    const signupData = (await signupResponse.json()) as SignupData;
    const forwardUrl = new URL(signupData.url);
    const state = forwardUrl.searchParams.get("state");

    // complete OAuth callback
    const callbackUrl = new URL(
        "http://localhost:3000/api/v1/auth/callback/github",
    );
    callbackUrl.searchParams.set("code", "test_code");
    callbackUrl.searchParams.set("state", state || "null");

    const callbackResponse = await SELF.fetch(callbackUrl.toString(), {
        method: "GET",
        headers: {
            "User-Agent": "Mozilla/5.0 (compatible; test-browser)",
            "Accept": "text/html,application/xhtml+xml",
        },
        redirect: "manual",
    });

    expect(callbackResponse.status).toBe(302);
    await callbackResponse.text();

    // extract session cookie
    const setCookieHeader = callbackResponse.headers.get("Set-Cookie");
    expect(setCookieHeader).toBeTruthy();

    const sessionMatch = setCookieHeader?.match(
        /better-auth\.session_token=([^;]+)/,
    );
    expect(sessionMatch).toBeTruthy();
    const sessionToken = sessionMatch?.[1];

    // verify session by accessing a protected endpoint
    const sessionResponse = await SELF.fetch(
        "http://localhost:3000/api/v1/auth/get-session",
        {
            method: "GET",
            headers: {
                "Cookie": `better-auth.session_token=${sessionToken}`,
                "Content-Type": "application/json",
            },
        },
    );

    expect(sessionResponse.status).toBe(200);

    const sessionData = (await sessionResponse.json()) as SessionData;
    expect(sessionData.user).toBeDefined();
    expect(sessionData.user.email).toBe("test@example.com");
    expect(sessionData.user.name).toBe("Test User");
    expect(sessionData.session).toBeDefined();
});
