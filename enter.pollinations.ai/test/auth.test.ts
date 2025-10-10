import { SELF } from "cloudflare:test";
import { afterEach, beforeEach, expect, test } from "vitest";
import { setupFetchMock, teardownFetchMock } from "./mocks/fetch";
import { createGithubMockHandlers } from "./mocks/github";
import { createMockPolar } from "./mocks/polar";

const mockPolar = createMockPolar();

const mockHandlers = {
    ...createGithubMockHandlers(),
    ...mockPolar.handlerMap,
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
        tier?: string;
    };
    session: unknown;
};

test("signup and session creation", async () => {
    const signupUrl = new URL("http://localhost:3000/api/auth/sign-in/social");

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
    if (!state) throw new Error("State param is missing");

    // complete OAuth callback
    const callbackUrl = new URL(
        "http://localhost:3000/api/auth/callback/github",
    );
    callbackUrl.searchParams.set("code", "test_code");
    callbackUrl.searchParams.set("state", state);

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
        "http://localhost:3000/api/auth/get-session",
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

test("new user has default 'seed' tier", async () => {
    const signupUrl = new URL("http://localhost:3000/api/auth/sign-in/social");

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
    if (!state) throw new Error("State param is missing");

    // complete OAuth callback
    const callbackUrl = new URL(
        "http://localhost:3000/api/auth/callback/github",
    );
    callbackUrl.searchParams.set("code", "test_code");
    callbackUrl.searchParams.set("state", state);

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

    // verify user has 'seed' tier
    const sessionResponse = await SELF.fetch(
        "http://localhost:3000/api/auth/get-session",
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
    expect(sessionData.user.tier).toBe("seed");
});
