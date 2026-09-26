import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { afterAll, beforeAll, expect, test } from "vitest";
import { getDashboardFlow } from "../flow-dashboard";
import { reviewCasesForFlow, reviewPageForLocation } from "../review-inventory";
import { startRuntime } from "../runtime";
import { openReviewContext } from "./review-browser";

const origin = "http://localhost:4180";
let runtime: Awaited<ReturnType<typeof startRuntime>>;
beforeAll(async () => {
    runtime = await startRuntime({ persist: false });
}, 60_000);
afterAll(async () => runtime?.dispose());

for (const section of ["keys", "apps"]) {
    for (const recipe of reviewCasesForFlow("account", section).filter(
        (recipe) => recipe.variant === "Failed",
    )) {
        test.runIf(process.env.FLOW_CAPTURE_TEST === "1")(
            `Dashboard failed action and cancellation: ${recipe.id}`,
            async () => {
                // Faults intercept every write; fixture records contain only
                // impossible hashes, never usable keys or revealable secrets.
                expect(recipe.requests).toContainEqual(
                    expect.objectContaining({
                        method: "POST",
                        outcome: "server-error",
                    }),
                );
                const browser = await chromium.launch({ headless: true });
                try {
                    const { context, credentialRequests } =
                        await openReviewContext(runtime, browser, recipe);
                    try {
                        const page = await context.newPage();
                        const query = new URLSearchParams({
                            ...recipe.query,
                            review_case: recipe.id,
                            review_flow: "account",
                            review_section: section,
                        });
                        await page.goto(`${origin}/flow-screen.html?${query}`);
                        for (const expected of recipe.expected)
                            await page
                                .locator(expected.selector)
                                .filter(
                                    expected.text
                                        ? { hasText: expected.text }
                                        : {},
                                )
                                .first()
                                .waitFor();
                        const observe = () =>
                            page.evaluate<string>(`(async () => {
                            const { observeScreen } = await import(${JSON.stringify(`/@fs/${fileURLToPath(new URL("../runtime-frame.tsx", import.meta.url))}`)});
                            return observeScreen(document)?.node;
                        })()`);
                        const node = await observe();
                        expect(node).toBe(recipe.pageId);
                        expect(
                            reviewPageForLocation(
                                { flow: "account", section },
                                { node, flow: "account" },
                            )?.entry.id,
                        ).toBe(recipe.pageId);
                        expect(
                            getDashboardFlow(section).nodes.some(
                                (item) => item.id === node,
                            ),
                        ).toBe(true);

                        const cancel = page.getByRole("button", {
                            name: "Cancel",
                            exact: true,
                        });
                        expect(await cancel.isEnabled()).toBe(true);
                        await cancel.click();
                        await page
                            .getByRole("dialog")
                            .waitFor({ state: "hidden" });
                        expect(await observe()).toBe(section);
                        const records = await page.evaluate(async () => {
                            const response = await fetch("/api/api-keys");
                            if (!response.ok)
                                throw new Error("Key metadata unavailable");
                            const result = await response.json();
                            return result.data
                                .map((key: { id: string; name: string }) => ({
                                    id: key.id,
                                    name: key.name,
                                }))
                                .sort((a: { id: string }, b: { id: string }) =>
                                    a.id.localeCompare(b.id),
                                );
                        });
                        expect(records).toEqual([
                            {
                                id: "flow-review-app",
                                name: "Example app registration",
                            },
                            { id: "flow-review-key", name: "App example" },
                        ]);
                        expect(credentialRequests).toEqual(
                            recipe.pageId.endsWith("-create")
                                ? ["/api/api-keys"]
                                : [],
                        );
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
}

for (const section of ["catalog", "activity"]) {
    test.runIf(process.env.FLOW_CAPTURE_TEST === "1")(
        `Dashboard retries its failed ${section} read without losing the page`,
        async () => {
            const recipe = reviewCasesForFlow("account", section).find(
                (item) => item.variant === "Load failed",
            );
            if (!recipe) throw new Error(`Missing ${section} failure`);
            const browser = await chromium.launch({ headless: true });
            try {
                const { context, credentialRequests } = await openReviewContext(
                    runtime,
                    browser,
                    recipe,
                );
                try {
                    const page = await context.newPage();
                    await page.goto(
                        `${origin}/flow-screen.html?${new URLSearchParams(recipe.query)}`,
                    );
                    for (const expected of recipe.expected)
                        await page
                            .locator(expected.selector)
                            .filter(
                                expected.text ? { hasText: expected.text } : {},
                            )
                            .first()
                            .waitFor();
                    const retry = page.getByRole("button", {
                        name: "Try again",
                        exact: true,
                    });
                    expect(await retry.isEnabled()).toBe(true);
                    const restored = await page.evaluate(async () => {
                        const response = await fetch(
                            "/__flow/review/requests",
                            {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: "[]",
                            },
                        );
                        return response.ok;
                    });
                    expect(restored).toBe(true);
                    await retry.click();
                    const ready = reviewCasesForFlow("account", section)[0];
                    for (const expected of ready.expected)
                        await page
                            .locator(expected.selector)
                            .filter(
                                expected.text ? { hasText: expected.text } : {},
                            )
                            .first()
                            .waitFor();
                    expect(await page.locator('[role="alert"]').count()).toBe(
                        0,
                    );
                    expect(new URL(page.url()).pathname).toBe(
                        section === "catalog" ? "/models" : "/activity",
                    );
                    expect(credentialRequests).toEqual([]);
                } finally {
                    await context.close();
                }
            } finally {
                await browser.close();
            }
        },
        60000,
    );
}

for (const recipe of reviewCasesForFlow("account", "main").filter(
    (item) => item.pageId === "dashboard-auth-error",
)) {
    test.runIf(process.env.FLOW_CAPTURE_TEST === "1")(
        `Dashboard error exposes the current recovery destination: ${recipe.id}`,
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
                    await page.goto(
                        `${origin}/flow-screen.html?${new URLSearchParams(recipe.query)}`,
                    );
                    for (const expected of recipe.expected)
                        await page
                            .locator(expected.selector)
                            .filter(
                                expected.text ? { hasText: expected.text } : {},
                            )
                            .first()
                            .waitFor();
                    const banned = recipe.conditions.account === "banned";
                    const link = page.getByRole("link", {
                        name: banned
                            ? "billing@pollinations.ai"
                            : "Go to dashboard",
                        exact: true,
                    });
                    expect(await link.getAttribute("href")).toBe(
                        banned ? "mailto:billing@pollinations.ai" : "/",
                    );
                    const edges = getDashboardFlow("main").edges;
                    expect(edges).toContainEqual(
                        expect.objectContaining({
                            from: "dashboard-auth-error",
                            to: banned
                                ? "dashboard-billing"
                                : "dashboard-ready",
                        }),
                    );
                    if (!banned) {
                        await link.click();
                        await page.waitForURL(
                            (url) => url.pathname === "/news",
                        );
                        await page
                            .getByRole("button", {
                                name: "Sign in with GitHub",
                                exact: true,
                            })
                            .waitFor();
                    }
                    expect(credentialRequests).toEqual([]);
                } finally {
                    await context.close();
                }
            } finally {
                await browser.close();
            }
        },
        60000,
    );
}
