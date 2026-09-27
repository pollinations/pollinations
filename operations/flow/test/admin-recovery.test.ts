import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { afterAll, beforeAll, expect, test } from "vitest";
import { getFlowFocus } from "../flow-diagram";
import { ADMIN_ORIGIN, ENTER_ORIGIN } from "../local-origins";
import { adminReviewCases } from "../review-device-admin";
import { reviewPageForLocation } from "../review-inventory";
import { startRuntime } from "../runtime";
import { openReviewContext } from "./review-browser";

let runtime: Awaited<ReturnType<typeof startRuntime>>;
beforeAll(async () => {
    runtime = await startRuntime({ persist: false });
}, 60_000);
afterAll(async () => runtime?.dispose());

const faults = (rules: unknown[] = []) =>
    runtime.fetch(
        new Request(`${ADMIN_ORIGIN}/__flow/review/requests`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(rules),
        }),
    );

for (const recipe of adminReviewCases.filter(
    (item) => item.pageId === "dashboard-sign-in",
)) {
    test.runIf(process.env.FLOW_CAPTURE_TEST === "1")(
        `Admin sign-in recovery: ${recipe.id}`,
        async () => {
            const browser = await chromium.launch({ headless: true });
            try {
                const { context, credentialRequests } = await openReviewContext(
                    runtime,
                    browser,
                    recipe,
                );
                try {
                    const page = await context.newPage();
                    page.setDefaultTimeout(15_000);
                    await page.goto(
                        `${ADMIN_ORIGIN}/flow-screen.html?${new URLSearchParams(recipe.query)}`,
                    );
                    for (const expected of recipe.expected)
                        await page
                            .locator(expected.selector)
                            .filter({
                                ...(expected.text
                                    ? { hasText: expected.text }
                                    : {}),
                                visible: true,
                            })
                            .first()
                            .waitFor();
                    expect(new URL(page.url()).pathname).toBe("/");
                    const node = await page.evaluate<string>(`(async () => {
                    const { observeScreen } = await import(${JSON.stringify(`/@fs/${fileURLToPath(new URL("../observe-screen.ts", import.meta.url))}`)});
                    return observeScreen(document)?.node;
                })()`);
                    expect(node).toBe(recipe.pageId);
                    expect(
                        reviewPageForLocation(
                            { flow: "admin", section: "main" },
                            { node },
                        )?.entry.id,
                    ).toBe(node);
                    expect(
                        getFlowFocus("admin", "main").nodes.some(
                            (item) => item.id === node,
                        ),
                    ).toBe(true);
                    if (recipe.requests?.length) {
                        await faults();
                        if (recipe.id === "admin-session-unavailable")
                            await page
                                .getByRole("button", {
                                    name: "Reload",
                                    exact: true,
                                })
                                .click();
                        else await page.reload();
                    }
                    await page
                        .getByRole("button", {
                            name: recipe.query.auth_error
                                ? "Try again"
                                : "Sign in with Pollinations",
                            exact: true,
                        })
                        .click();
                    await page.waitForURL(
                        (url) =>
                            url.origin === ENTER_ORIGIN &&
                            url.pathname === "/app/sign-in",
                    );
                    await page
                        .getByRole("button", {
                            name: "Sign in with GitHub",
                            exact: true,
                        })
                        .waitFor();
                    expect(
                        new URL(page.url()).searchParams.get("redirect_uri"),
                    ).toBe(`${ADMIN_ORIGIN}/auth/callback`);
                    expect(credentialRequests).toEqual([]);
                } finally {
                    await context.close();
                }
            } finally {
                await browser.close();
            }
        },
        60_000,
    );
}

// Real callbacks with missing/consumed codes cannot create reusable tokens.
test("Admin callback routing preserves main's result and separate origin", async () => {
    const invalid = await runtime.fetch(
        new Request(`${ADMIN_ORIGIN}/auth/callback?code=invalid`),
    );
    expect(invalid.headers.get("Location")).toBe(
        `${ADMIN_ORIGIN}/?auth_error=invalid_state`,
    );
    for (const cancelled of [true, false]) {
        const login = await runtime.fetch(
            new Request(`${ADMIN_ORIGIN}/auth/login`),
        );
        expect(login.status).toBe(302);
        const authorize = new URL(login.headers.get("Location") ?? "");
        expect(authorize.origin).toBe(ENTER_ORIGIN);
        expect(authorize.searchParams.get("redirect_uri")).toBe(
            `${ADMIN_ORIGIN}/auth/callback`,
        );
        const callback = new URL("/auth/callback", ADMIN_ORIGIN);
        callback.searchParams.set(
            "state",
            authorize.searchParams.get("state") ?? "",
        );
        callback.searchParams.set(
            cancelled ? "error" : "code",
            cancelled ? "access_denied" : "invalid-consumed-review-code",
        );
        const response = await runtime.fetch(
            new Request(callback, {
                headers: {
                    Cookie: login.headers
                        .getSetCookie()
                        .map((value) => value.split(";")[0])
                        .join("; "),
                },
            }),
        );
        expect(response.headers.get("Location")).toBe(
            `${ADMIN_ORIGIN}/?auth_error=${cancelled ? "cancelled" : "unavailable"}`,
        );
        expect(
            response.headers
                .getSetCookie()
                .every((cookie) => cookie.includes("Max-Age=0")),
        ).toBe(true);
    }
    const session = await runtime.fetch(
        new Request(`${ADMIN_ORIGIN}/auth/session`),
    );
    expect(await session.json()).toEqual({ user: null });
});

for (const recipe of adminReviewCases.filter(
    (item) => item.pageId === "dashboard-connected",
)) {
    test.runIf(process.env.FLOW_ADMIN_OAUTH_TEST === "1")(
        `Admin authorized session recovery: ${recipe.id}`,
        async () => {
            const browser = await chromium.launch({ headless: true });
            try {
                const { context } = await openReviewContext(
                    runtime,
                    browser,
                    recipe,
                );
                try {
                    const page = await context.newPage();
                    page.setDefaultTimeout(15_000);
                    await page.goto(
                        `${ADMIN_ORIGIN}/flow-screen.html?${new URLSearchParams({ ...recipe.query, review_case: recipe.id, review_flow: "admin", review_section: "main" })}`,
                    );
                    await page
                        .locator('[data-admin-connected="true"]')
                        .waitFor();
                    for (const expected of recipe.expected)
                        await page
                            .locator(expected.selector)
                            .filter({
                                ...(expected.text
                                    ? { hasText: expected.text }
                                    : {}),
                                visible: true,
                            })
                            .first()
                            .waitFor();
                    expect(new URL(page.url()).origin).toBe(ADMIN_ORIGIN);
                    expect(new URL(page.url()).pathname).toBe("/");
                    // The main hook keeps an established user during a failed
                    // background refresh. This is observed behavior, not a fixture.
                    await faults([
                        { path: "/auth/session", outcome: "unavailable" },
                    ]);
                    const refresh = page.waitForResponse(
                        (response) =>
                            new URL(response.url()).pathname ===
                                "/auth/session" && response.status() === 503,
                    );
                    await page.evaluate(() =>
                        window.dispatchEvent(new Event("focus")),
                    );
                    await refresh;
                    expect(
                        await page
                            .locator('[data-admin-connected="true"]')
                            .count(),
                    ).toBe(1);
                    await faults();
                    // Sign out from the same real menu, including retry after failure.
                    if (
                        !(await page
                            .getByRole("button", {
                                name: "Sign out",
                                exact: true,
                            })
                            .isVisible())
                    )
                        await page
                            .getByRole("button", { name: /^Account menu for/ })
                            .click();
                    await page
                        .getByRole("button", { name: "Sign out", exact: true })
                        .click();
                    await page
                        .getByRole("button", {
                            name: "Sign in with Pollinations",
                            exact: true,
                        })
                        .waitFor();
                    expect(new URL(page.url()).pathname).toBe("/");
                    expect(new URL(page.url()).origin).toBe(ADMIN_ORIGIN);
                    const session = await page.evaluate(async () => {
                        const response = await fetch("/auth/session");
                        return {
                            status: response.status,
                            user: (await response.json()).user,
                        };
                    });
                    expect(session.status).toBe(401);
                    expect(session.user).toBeNull();
                } finally {
                    await context.close();
                }
            } finally {
                await browser.close();
            }
        },
        60_000,
    );
}

test.runIf(process.env.FLOW_CAPTURE_TEST === "1")(
    "Admin Journey observes its separate host and real Enter return",
    async () => {
        const browser = await chromium.launch({ headless: true });
        try {
            const recipe = adminReviewCases.find(
                (item) => item.id === "dashboard-sign-in",
            );
            if (!recipe) throw new Error("Missing Admin entry");
            const { context } = await openReviewContext(
                runtime,
                browser,
                recipe,
            );
            try {
                const page = await context.newPage();
                page.setDefaultTimeout(15_000);
                const errors: string[] = [];
                page.on("pageerror", (error) => errors.push(error.message));
                await page.goto(
                    `${ENTER_ORIGIN}/flow?theme=dark&view=journey&flow=admin&section=main`,
                );
                const frame = page.frameLocator('iframe[title$="· journey"]');
                await frame
                    .getByRole("button", {
                        name: "Sign in with Pollinations",
                        exact: true,
                    })
                    .waitFor();
                expect(
                    await page
                        .locator(".flow-screen-caption strong")
                        .innerText(),
                ).toBe("Admin sign-in");
                await page.screenshot({
                    path: "/private/tmp/flow-admin-journey.png",
                });
                await frame
                    .getByRole("button", {
                        name: "Sign in with Pollinations",
                        exact: true,
                    })
                    .click();
                await frame
                    .getByRole("button", {
                        name: "Sign in with GitHub",
                        exact: true,
                    })
                    .waitFor();
                await expect
                    .poll(() =>
                        page.locator(".flow-screen-caption strong").innerText(),
                    )
                    .toBe("Sign in to Pollinations");
                await page
                    .getByRole("button", { name: "Previous step", exact: true })
                    .click();
                await frame
                    .getByRole("button", {
                        name: "Sign in with Pollinations",
                        exact: true,
                    })
                    .waitFor();
                await expect
                    .poll(() =>
                        page.locator(".flow-screen-caption strong").innerText(),
                    )
                    .toBe("Admin sign-in");
                expect(errors).toEqual([]);
            } finally {
                await context.close();
            }
        } finally {
            await browser.close();
        }
    },
    60_000,
);

test("applies review failures before the real Admin handler and restores it", async () => {
    const request = (path: string, body?: unknown) =>
        runtime.fetch(
            new Request(`http://localhost:4182${path}`, {
                method: body === undefined ? "GET" : "POST",
                headers: { "Content-Type": "application/json" },
                ...(body !== undefined && { body: JSON.stringify(body) }),
            }),
        );
    await (await request("/__flow/reset", {})).body?.cancel();
    await (
        await request("/__flow/review/requests", [
            { path: "/auth/session", outcome: "unavailable" },
        ])
    ).body?.cancel();
    const failure = await request("/auth/session");
    expect(failure.status).toBe(503);
    expect((await failure.json()).error.code).toBe("SERVICE_UNAVAILABLE");
    await (await request("/__flow/review/requests", [])).body?.cancel();
    const restored = await request("/auth/session");
    // The native Admin endpoint reports a signed-out session as 401.
    expect(restored.status).toBe(401);
    expect((await restored.json()).user).toBeNull();
});
