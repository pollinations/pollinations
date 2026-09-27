import { chromium } from "playwright";
import { afterEach, expect, test, vi } from "vitest";
import { createReviewerGateway, REVIEWER_AUTH_PATH } from "../reviewer-gateway";
import preview from "../wrangler.preview.json";

const origins = {
    enter: preview.vars.FLOW_ENTER_ORIGIN,
    admin: preview.vars.FLOW_ADMIN_ORIGIN,
};
const config = {
    origins,
    clientId: "pk_inert_gateway_test",
    sessionSecret: "public-inert-flow-gateway-test-secret",
};
const sessionName = "flow-reviewer_pollinations_session";
const flowName = "flow-reviewer_pollinations_oauth_flow";
const cookie = (response: Response, name: string) =>
    response.headers
        .getSetCookie()
        .find((value) => value.startsWith(`${name}=`))
        ?.split(";")[0] ?? "";

// Only the external identity issuer is a test fixture. Gateway authorization,
// PKCE/cookies, encryption and session validation execute their real code.
function identityIssuer() {
    return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        expect(url.origin).toBe("https://enter.pollinations.ai");
        if (url.pathname.endsWith("/token")) {
            const body = new URLSearchParams(String(init?.body));
            expect(body.get("code_verifier")).toBeTruthy();
            return Response.json({
                access_token: body.get("code"),
                expires_in: 3600,
            });
        }
        const sub = new Headers(init?.headers)
            .get("Authorization")
            ?.slice("Bearer ".length);
        return Response.json({
            sub,
            email: `${sub}@example.com`,
            role: "user",
        });
    });
}
type Gateway = ReturnType<typeof createReviewerGateway>;
async function signIn(gateway: Gateway, id: string) {
    const login = await gateway(
        new Request(
            `${origins.enter}${REVIEWER_AUTH_PATH}/login?return_to=%2Fflow`,
        ),
    );
    const target = new URL(login.headers.get("Location") ?? "");
    expect(target.origin).toBe("https://enter.pollinations.ai");
    expect(target.searchParams.get("redirect_uri")).toBe(
        `${origins.enter}${REVIEWER_AUTH_PATH}/callback`,
    );
    const callback = await gateway(
        new Request(
            `${origins.enter}${REVIEWER_AUTH_PATH}/callback?code=${id}&state=${target.searchParams.get("state")}`,
            {
                headers: { Cookie: cookie(login, flowName) },
            },
        ),
    );
    expect(callback.headers.get("Location")).toBe(`${origins.enter}/flow`);
    expect(
        callback.headers
            .getSetCookie()
            .some(
                (value) =>
                    value.startsWith(`${sessionName}=`) &&
                    value.includes("HttpOnly; Secure; SameSite=Lax") &&
                    value.endsWith("Domain=flow-preview.pollinations.ai"),
            ),
    ).toBe(true);
    return cookie(callback, sessionName);
}
afterEach(() => vi.useRealTimers());

test("gateway-selected runtimes isolate reviewer databases, faults and resets", async () => {
    const { bundleWorkers, startRuntime } = await import("../runtime");
    const scripts = await bundleWorkers();
    const aliceRuntime = await startRuntime({
        scripts,
        persist: false,
        origins,
    });
    const bobRuntime = await startRuntime({ scripts, persist: false, origins });
    const runtimes = new Map([
        ["alice", aliceRuntime],
        ["bob", bobRuntime],
    ]);
    try {
        const gateway = createReviewerGateway(
            { ...config, authFetch: identityIssuer() },
            async (id, request) => {
                const runtime = runtimes.get(id);
                if (!runtime) throw new Error("Unexpected reviewer");
                expect(request.headers.get("Cookie") ?? "").not.toContain(
                    sessionName,
                );
                return runtime.fetch(request);
            },
        );
        const alice = await signIn(gateway, "alice");
        const bob = await signIn(gateway, "bob");
        const request = (session: string, path: string, body?: unknown) =>
            gateway(
                new Request(`${origins.enter}${path}`, {
                    method: body === undefined ? "GET" : "POST",
                    headers: {
                        Cookie: session,
                        Origin: origins.enter,
                        "Content-Type": "application/json",
                        "X-Flow-Reviewer": "bob",
                    },
                    ...(body === undefined
                        ? {}
                        : { body: JSON.stringify(body) }),
                }),
            );
        const post = async (session: string, path: string, body: unknown) => {
            const response = await request(session, path, body);
            expect(response.status).toBe(200);
            await response.body?.cancel();
        };
        const state = async (session: string) =>
            (await request(session, "/__flow/state?reviewer=bob")).json();
        const fresh = await request(alice, "/__flow/state");
        expect(fresh.status).toBe(409);
        await fresh.body?.cancel();
        await post(alice, "/__flow/reset", {});
        await post(bob, "/__flow/reset", {});
        await post(alice, "/__flow/conditions", { pollen: "empty" });
        await post(bob, "/__flow/conditions", { pollen: "quest" });
        await post(bob, "/__flow/review/requests", [
            { path: "/api/app-lookup", outcome: "unavailable" },
        ]);
        expect((await state(alice)).wallet.total).toBe(0);
        const bobState = await state(bob);
        expect(bobState.wallet.total).toBe(5);
        await post(alice, "/__flow/reset", {});
        expect((await state(alice)).wallet.total).toBe(10);
        expect(await state(bob)).toEqual(bobState);
        const lookup =
            "/api/app-lookup?client_id=pk_flow_local_example_not_a_real_credential";
        const allowed = await request(alice, lookup);
        const failed = await request(bob, lookup);
        expect(allowed.status).toBe(200);
        expect(failed.status).toBe(503);
        await Promise.all([allowed.body?.cancel(), failed.body?.cancel()]);
    } finally {
        await Promise.all([aliceRuntime.dispose(), bobRuntime.dispose()]);
    }
}, 60_000);

test("protects every origin and route before starting a review environment", async () => {
    const forward = vi.fn();
    const gateway = createReviewerGateway(
        { ...config, authFetch: identityIssuer() },
        forward,
    );
    for (const origin of Object.values(origins)) {
        for (const path of [
            "/flow",
            "/__flow/state",
            "/api/auth/get-session",
            "/auth/session",
            "/assets/app.js",
        ]) {
            expect(
                (await gateway(new Request(`${origin}${path}`))).status,
            ).toBe(401);
        }
        expect(
            (
                await gateway(
                    new Request(`${origin}/__flow/reset`, {
                        method: "POST",
                        headers: { Origin: origin },
                    }),
                )
            ).status,
        ).toBe(401);
    }
    const entry = await gateway(
        new Request(`${origins.enter}/flow?view=journey`, {
            headers: { Accept: "text/html" },
        }),
    );
    expect(await entry.text()).toContain("Sign in with Pollinations");
    expect(forward).not.toHaveBeenCalled();
});

test("one ordinary-account login selects the same reviewer on both origins and never forwards its cookie", async () => {
    const calls: { id: string; request: Request }[] = [];
    const gateway = createReviewerGateway(
        { ...config, authFetch: identityIssuer() },
        async (id, request) => {
            calls.push({ id, request });
            return new Response("fixture page", {
                headers: {
                    "Set-Cookie": "pollinations_session=inert-fixture; Path=/",
                    "Content-Security-Policy": "script-src 'self'",
                },
            });
        },
    );
    const alice = await signIn(gateway, "alice");
    const bob = await signIn(gateway, "bob");
    for (const [session, id] of [
        [alice, "alice"],
        [bob, "bob"],
    ]) {
        for (const origin of Object.values(origins)) {
            const response = await gateway(
                new Request(`${origin}/__flow/state?reviewer=someone-else`, {
                    headers: {
                        Cookie: `${session}; pollinations_session=inert-fixture`,
                        "X-Flow-Reviewer": "someone-else",
                    },
                }),
            );
            expect(response.status).toBe(200);
            const call = calls.at(-1);
            expect(call?.id).toBe(id);
            expect(call?.request.headers.get("Cookie")).toBe(
                " pollinations_session=inert-fixture".trimStart(),
            );
            expect(call?.request.redirect).toBe("manual");
            expect(response.headers.get("Cache-Control")).toBe(
                "private, no-store",
            );
            expect(response.headers.getSetCookie()).toEqual([
                "pollinations_session=inert-fixture; Path=/",
            ]);
            expect(response.headers.get("Content-Security-Policy")).toContain(
                "script-src 'self'",
            );
        }
    }
    const count = calls.length;
    for (const origin of [
        "https://other.flow-preview.pollinations.ai",
        "https://pollinations.ai",
        "http://flow-preview.pollinations.ai",
    ]) {
        expect(
            (
                await gateway(
                    new Request(`${origin}/__flow/state`, {
                        headers: { Cookie: alice },
                    }),
                )
            ).status,
        ).toBe(403);
    }
    for (const origin of ["https://untrusted.example", ""]) {
        expect(
            (
                await gateway(
                    new Request(`${origins.enter}/__flow/reset`, {
                        method: "POST",
                        headers: { Cookie: alice, Origin: origin },
                    }),
                )
            ).status,
        ).toBe(403);
    }
    expect(calls).toHaveLength(count);
});

test("does not let a fixture response change the reviewer session", async () => {
    const gateway = createReviewerGateway(
        { ...config, authFetch: identityIssuer() },
        async () =>
            new Response("fixture", {
                headers: {
                    "Set-Cookie": `${sessionName}=inert-collision; Path=/`,
                },
            }),
    );
    const session = await signIn(gateway, "alice");
    const response = await gateway(
        new Request(`${origins.admin}/auth/logout`, {
            method: "POST",
            headers: { Cookie: session, Origin: origins.admin },
        }),
    );
    expect(response.status).toBe(502);
    expect(response.headers.has("Set-Cookie")).toBe(false);
});

test("revalidates from either host and rejects revoked sessions without entering a container", async () => {
    const upstream = identityIssuer();
    const forward = vi.fn(async () => new Response("fixture"));
    const gateway = createReviewerGateway(
        { ...config, authFetch: upstream },
        forward,
    );
    const session = await signIn(gateway, "alice");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 60_000);
    const response = await gateway(
        new Request(`${origins.admin}/`, { headers: { Cookie: session } }),
    );
    expect(response.status).toBe(200);
    expect(cookie(response, sessionName)).toBeTruthy();
    expect(response.headers.getSetCookie()[0]).toContain(
        "Domain=flow-preview.pollinations.ai",
    );
    upstream.mockResolvedValueOnce(new Response(null, { status: 401 }));
    expect(
        (
            await gateway(
                new Request(`${origins.enter}/__flow/state`, {
                    headers: { Cookie: session },
                }),
            )
        ).status,
    ).toBe(401);
    expect(forward).toHaveBeenCalledTimes(1);
});

test("preserves capacity responses and lets the same non-admin reviewer retry", async () => {
    let available = false;
    const gateway = createReviewerGateway(
        { ...config, authFetch: identityIssuer() },
        async (id) => {
            expect(id).toBe("alice");
            return available
                ? new Response("Review ready")
                : new Response("No container instance is available.", {
                      status: 503,
                  });
        },
    );
    const session = await signIn(gateway, "alice");
    const request = () =>
        new Request(`${origins.enter}/flow`, { headers: { Cookie: session } });
    const busy = await gateway(request());
    expect(busy.status).toBe(503);
    expect(await busy.text()).toBe("No container instance is available.");
    expect(busy.headers.getSetCookie()).toEqual([]);
    available = true;
    const retry = await gateway(request());
    expect(retry.status).toBe(200);
    expect(await retry.text()).toBe("Review ready");
});

test("reviewer callback errors stay out of the simulated Admin callback route", async () => {
    const gateway = createReviewerGateway(
        { ...config, authFetch: identityIssuer() },
        async () => new Response("real fixture callback page"),
    );
    const failure = await gateway(
        new Request(
            `${origins.enter}${REVIEWER_AUTH_PATH}/callback?code=invalid&state=invalid`,
        ),
    );
    expect(new URL(failure.headers.get("Location") ?? "").pathname).toBe(
        `${REVIEWER_AUTH_PATH}/error`,
    );
    const recovery = await gateway(
        new Request(failure.headers.get("Location") ?? ""),
    );
    expect(await recovery.text()).toContain("Your sign-in link expired.");
    const session = await signIn(gateway, "alice");
    const fixture = await gateway(
        new Request(`${origins.admin}/?auth_error=admin_required`, {
            headers: { Cookie: session },
        }),
    );
    expect(await fixture.text()).toBe("real fixture callback page");
});

test("a browser shares one HttpOnly session across exactly the configured gateway hosts and signs out of both", async () => {
    const gateway = createReviewerGateway(
        { ...config, authFetch: identityIssuer() },
        async () =>
            new Response("<!doctype html><title>Isolated review</title>", {
                headers: { "Content-Type": "text/html" },
            }),
    );
    const session = await signIn(gateway, "alice");
    const browser = await chromium.launch({ headless: true });
    try {
        const context = await browser.newContext();
        await context.route("**/*", async (route) => {
            const incoming = route.request();
            const response = await gateway(
                new Request(incoming.url(), {
                    method: incoming.method(),
                    headers: await incoming.allHeaders(),
                    ...(incoming.postDataBuffer() && {
                        body: incoming.postDataBuffer(),
                    }),
                }),
            );
            await route.fulfill({
                status: response.status,
                body: Buffer.from(await response.arrayBuffer()),
                headers: {
                    ...Object.fromEntries(response.headers),
                    "Set-Cookie": response.headers.getSetCookie().join("\n"),
                },
            });
        });
        await context.addCookies([
            {
                name: sessionName,
                value: session.slice(sessionName.length + 1),
                domain: ".flow-preview.pollinations.ai",
                path: "/",
                httpOnly: true,
                secure: true,
                sameSite: "Lax",
            },
        ]);
        for (const origin of Object.values(origins)) {
            const page = await context.newPage();
            await page.goto(`${origin}/flow`);
            expect(await page.title()).toBe("Isolated review");
            expect(await page.evaluate(() => document.cookie)).not.toContain(
                sessionName,
            );
            await page.close();
        }
        const page = await context.newPage();
        await page.goto(`${origins.admin}/flow`);
        // Chromium applies the deletion cookies before returning an opaque
        // redirect. Keep the redirect inside the intercepted test transport.
        expect(
            await page.evaluate(
                async (path) =>
                    (
                        await fetch(`${path}/logout`, {
                            method: "POST",
                            redirect: "manual",
                        })
                    ).type,
                REVIEWER_AUTH_PATH,
            ),
        ).toBe("opaqueredirect");
        expect(
            (await context.cookies()).some(
                (value) => value.name === sessionName,
            ),
        ).toBe(false);
        for (const origin of Object.values(origins)) {
            await page.goto(`${origin}/flow`);
            expect(await page.title()).toBe("Pollinations Flow");
            expect(
                await page
                    .getByRole("link", { name: "Sign in with Pollinations" })
                    .count(),
            ).toBe(1);
        }
        await context.close();
    } finally {
        await browser.close();
    }
}, 30_000);
