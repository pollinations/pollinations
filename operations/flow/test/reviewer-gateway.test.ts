import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { Miniflare } from "miniflare";
import { chromium } from "playwright";
import {
    afterAll,
    afterEach,
    assert,
    beforeAll,
    expect,
    test,
    vi,
} from "vitest";
import { createReviewerGateway, REVIEWER_AUTH_PATH } from "../reviewer-gateway";

const workerConfig = JSON.parse(
    readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"),
);

const origins = {
    enter: workerConfig.vars.FLOW_ENTER_ORIGIN,
    admin: workerConfig.vars.FLOW_ADMIN_ORIGIN,
};
let assetRuntime: Miniflare;
let config: Parameters<typeof createReviewerGateway>[0];
beforeAll(async () => {
    await promisify(execFile)("npm", ["run", "build:reviewer"], {
        cwd: fileURLToPath(new URL("..", import.meta.url)),
    });
    // Exercise the built UI through Cloudflare's real local asset binding.
    assetRuntime = new Miniflare({
        modules: true,
        script: "export default {}",
        assets: {
            directory: fileURLToPath(new URL("../dist", import.meta.url)),
            binding: workerConfig.assets.binding,
            assetConfig: {
                html_handling: workerConfig.assets.html_handling,
                not_found_handling: workerConfig.assets.not_found_handling,
            },
        },
    });
    const { ASSETS } = await assetRuntime.getBindings();
    config = {
        origins,
        clientId: "pk_inert_gateway_test",
        sessionSecret: "public-inert-flow-gateway-test-secret",
        assets: {
            fetch: (request) => {
                // The Node proxy is a localhost RPC transport. Browser origin
                // checks have already run in the real gateway above it.
                const headers = new Headers(request.headers);
                headers.delete("Origin");
                headers.delete("Host");
                return ASSETS.fetch(request.url, {
                    method: request.method,
                    headers: Object.fromEntries(headers),
                });
            },
        },
    };
}, 60_000);
afterAll(async () => assetRuntime?.dispose());
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
            `${origins.enter}${REVIEWER_AUTH_PATH}/login?return_to=%2Fscreens`,
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
    expect(callback.headers.get("Location")).toBe(`${origins.enter}/screens`);
    expect(
        callback.headers
            .getSetCookie()
            .some(
                (value) =>
                    value.startsWith(`${sessionName}=`) &&
                    value.includes("HttpOnly; Secure; SameSite=Lax") &&
                    value.endsWith("Domain=flow.pollinations.ai"),
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
            "/screens",
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
        new Request(`${origins.enter}/journey?flow=device`, {
            headers: { Accept: "text/html" },
        }),
    );
    const entryHtml = await entry.text();
    expect(entryHtml).toContain("Pollinations Flow");
    expect(entryHtml).toContain("return_to=%2Fjourney%3Fflow%3Ddevice");
    const script = entryHtml.match(/src="([^"]+\.js)"/)?.[1];
    expect(script).toBeTruthy();
    const asset = await gateway(new Request(`${origins.enter}${script}`));
    expect(asset.status).toBe(200);
    expect(asset.headers.get("Content-Type")).toContain("javascript");
    await asset.body?.cancel();
    expect(
        (
            await gateway(
                new Request(`${origins.enter}/flow-reviewer/assets/missing.js`),
            )
        ).status,
    ).toBe(404);
    for (const origin of Object.values(origins)) {
        const health = await gateway(
            new Request(`${origin}/flow-reviewer`, {
                headers: { Accept: "*/*" },
            }),
        );
        expect(health.status).toBe(200);
        expect(await health.text()).toContain('name="flow-login"');
    }
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
        "https://other.flow.pollinations.ai",
        "https://pollinations.ai",
        "http://flow.pollinations.ai",
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
        "Domain=flow.pollinations.ai",
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
        new Request(`${origins.enter}/screens`, {
            headers: { Cookie: session },
        });
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
    expect(await recovery.text()).toContain('name="flow-login"');
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
                domain: ".flow.pollinations.ai",
                path: "/",
                httpOnly: true,
                secure: true,
                sameSite: "Lax",
            },
        ]);
        for (const origin of Object.values(origins)) {
            const page = await context.newPage();
            await page.goto(`${origin}/screens`);
            expect(await page.title()).toBe("Isolated review");
            expect(await page.evaluate(() => document.cookie)).not.toContain(
                sessionName,
            );
            await page.close();
        }
        const page = await context.newPage();
        await page.goto(`${origins.admin}/screens`);
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
            await page.goto(`${origin}/screens`);
            expect(await page.title()).toBe("Pollinations Flow");
            await page
                .getByRole("button", { name: "Sign in with Pollinations" })
                .waitFor({ state: "visible" });
            expect(
                await page
                    .getByRole("button", { name: "Sign in with Pollinations" })
                    .count(),
            ).toBe(1);
        }
        await context.close();
    } finally {
        await browser.close();
    }
}, 30_000);

test("built sign-in renders shared themes and errors, and preserves the canonical login destination", async () => {
    const forward = vi.fn();
    const gateway = createReviewerGateway(config, forward);
    const browser = await chromium.launch({ headless: true });
    const errors: string[] = [];
    try {
        const context = await browser.newContext();
        let authorize: URL | undefined;
        await context.route("**/*", async (route) => {
            const incoming = route.request();
            const response = await gateway(
                new Request(incoming.url(), {
                    headers: await incoming.allHeaders(),
                }),
            );
            if (
                new URL(incoming.url()).pathname ===
                `${REVIEWER_AUTH_PATH}/login`
            ) {
                // Run the real login handler, then stop before the external
                // identity provider. Callback/session checks live above.
                authorize = new URL(response.headers.get("Location") ?? "");
                await route.fulfill({
                    body: "<!doctype html><title>Login requested</title>",
                });
                return;
            }
            await route.fulfill({
                status: response.status,
                body: Buffer.from(await response.arrayBuffer()),
                headers: Object.fromEntries(response.headers),
            });
        });
        const page = await context.newPage();
        page.on("pageerror", (error) => errors.push(error.message));
        page.on("console", (message) => {
            if (message.type() === "error") errors.push(message.text());
        });
        const selection = "/journey?flow=device&situation=device-approve";
        for (const width of [320, 375, 1280]) {
            await page.setViewportSize({ width, height: 800 });
            for (const colorScheme of ["light", "dark"] as const) {
                await page.emulateMedia({ colorScheme });
                await page.goto(`${origins.enter}${selection}`);
                const button = page.getByRole("button", {
                    name: "Sign in with Pollinations",
                });
                await button.waitFor({ state: "visible" });
                expect(
                    await page
                        .getByText("Screens use sample data.", { exact: false })
                        .count(),
                ).toBe(1);
                expect(
                    await page
                        .getByText("admin account", { exact: false })
                        .count(),
                ).toBe(0);
                expect(
                    await page
                        .getByRole("switch", { name: "Toggle dark mode" })
                        .getAttribute("aria-checked"),
                ).toBe(String(colorScheme === "dark"));
                await page.evaluate(() => document.fonts.ready);
                const metrics = await page
                    .getByRole("dialog")
                    .evaluate((element) => ({
                        width: element.getBoundingClientRect().width,
                        overflow: element.scrollWidth > element.clientWidth,
                        fontsLoaded: [...document.fonts].some(
                            (font) => font.status === "loaded",
                        ),
                    }));
                expect(
                    await button.evaluate(
                        (element) => getComputedStyle(element).fontFamily,
                    ),
                ).toContain("Uncut Sans");
                expect(metrics.fontsLoaded).toBe(true);
                expect(metrics.overflow).toBe(false);
                expect(metrics.width).toBeLessThanOrEqual(width);
                const bounds = await button.boundingBox();
                assert(bounds);
                expect(bounds.y + bounds.height).toBeLessThanOrEqual(800);
            }
        }
        const toggle = page.getByRole("switch", { name: "Toggle dark mode" });
        await toggle.click();
        expect(await toggle.getAttribute("aria-checked")).toBe("false");
        await page.reload();
        await toggle.waitFor({ state: "visible" });
        expect(await toggle.getAttribute("aria-checked")).toBe("false");
        for (const [code, message] of Object.entries({
            cancelled: "Sign-in was cancelled. You can try again.",
            invalid_state:
                "Your Pollinations sign-in link expired. Please try again.",
            unavailable:
                "Couldn’t complete your Pollinations sign-in. Please try again.",
            access_denied:
                "Your Pollinations account could not sign in. Please try again.",
        })) {
            await page.goto(
                `${origins.enter}${REVIEWER_AUTH_PATH}/error?auth_error=${code}`,
            );
            await page
                .getByRole("button", { name: "Try again" })
                .waitFor({ state: "visible" });
            expect(await page.getByRole("alert").textContent()).toContain(
                message,
            );
        }
        // A fixture's auth_error must not become a reviewer sign-in error.
        await page.goto(
            `${origins.enter}${selection}&auth_error=admin_required`,
        );
        await page
            .getByRole("button", { name: "Sign in with Pollinations" })
            .click();
        await page.waitForURL(`${origins.enter}${REVIEWER_AUTH_PATH}/login?**`);
        expect(new URL(page.url()).searchParams.get("return_to")).toBe(
            `${selection}&auth_error=admin_required`,
        );
        expect(authorize?.searchParams.get("redirect_uri")).toBe(
            `${origins.enter}${REVIEWER_AUTH_PATH}/callback`,
        );
        expect(authorize?.searchParams.get("scope")).toBe(
            "openid profile email",
        );
        // An expired reviewer session inside the Admin iframe must sign in
        // at the top level on the canonical Flow host.
        await page.route(`${origins.enter}/screens`, (route) =>
            route.fulfill({
                contentType: "text/html",
                body: `<iframe title="Admin" src="${origins.admin}/screens" style="width:100%;height:800px"></iframe>`,
            }),
        );
        await page.goto(`${origins.enter}/screens`);
        await page
            .frameLocator("iframe")
            .getByRole("button", { name: "Sign in with Pollinations" })
            .click();
        await page.waitForURL(`${origins.enter}${REVIEWER_AUTH_PATH}/login?**`);
        expect(new URL(page.url()).searchParams.get("return_to")).toBe(
            "/screens",
        );
        expect(authorize?.searchParams.get("redirect_uri")).toBe(
            `${origins.enter}${REVIEWER_AUTH_PATH}/callback`,
        );
        expect(forward).not.toHaveBeenCalled();
        expect(errors).toEqual([]);
        await context.close();
    } finally {
        await browser.close();
    }
}, 30_000);

test("hosted homepage opens Flow while iframe and Admin roots keep their product routes", async () => {
    const forward = vi.fn(async () => new Response("Enter fixture"));
    const gateway = createReviewerGateway(
        { ...config, authFetch: identityIssuer() },
        forward,
    );
    const session = await signIn(gateway, "alice");
    for (const cookieValue of ["", session]) {
        const response = await gateway(
            new Request(`${origins.enter}/?theme=dark`, {
                headers: { Cookie: cookieValue, "Sec-Fetch-Dest": "document" },
            }),
        );
        expect(response.status).toBe(302);
        expect(response.headers.get("Location")).toBe(
            `${origins.enter}/screens?theme=dark`,
        );
    }
    expect(forward).not.toHaveBeenCalled();
    for (const [origin, destination] of [
        [origins.enter, "iframe"],
        [origins.admin, "document"],
    ]) {
        const response = await gateway(
            new Request(`${origin}/`, {
                headers: { Cookie: session, "Sec-Fetch-Dest": destination },
            }),
        );
        expect(await response.text()).toBe("Enter fixture");
    }
    const sessionResponse = await gateway(
        new Request(`${origins.enter}${REVIEWER_AUTH_PATH}/session`, {
            headers: { Cookie: session },
        }),
    );
    expect((await sessionResponse.json()).user.sub).toBe("alice");
    expect(forward).toHaveBeenCalledTimes(2);
});
