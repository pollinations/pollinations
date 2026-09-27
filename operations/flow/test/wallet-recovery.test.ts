import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { afterAll, beforeAll, expect, test } from "vitest";
import { getFlowFocus } from "../flow-diagram";
import { reviewCasesForFlow, reviewPageForLocation } from "../review-inventory";
import { startRuntime } from "../runtime";
import { openReviewContext } from "./review-browser";

const origin = "http://localhost:4180";
let runtime: Awaited<ReturnType<typeof startRuntime>>;
beforeAll(async () => {
    runtime = await startRuntime({ persist: false });
}, 60_000);
afterAll(async () => runtime?.dispose());

for (const flow of ["account", "app"] as const) {
    for (const recipe of reviewCasesForFlow(flow, "topup").filter(
        (item) =>
            ["enter-connected", "account-wallet"].includes(item.pageId) &&
            [
                "Balance unavailable",
                "Balance session expired",
                "Billing unavailable",
                "Auto top-up save failed",
                "Billing session expired",
                "Billing handoff failed",
                "Saving auto top-up",
                "Checkout returned",
                "Checkout canceled",
            ].includes(item.variant ?? ""),
    )) {
        test.runIf(process.env.FLOW_CAPTURE_TEST === "1")(
            `Wallet recovery: ${recipe.id}`,
            async () => {
                const browser = await chromium.launch({ headless: true });
                try {
                    const { context, credentialRequests } =
                        await openReviewContext(runtime, browser, recipe);
                    try {
                        const page = await context.newPage();
                        const writes: string[] = [];
                        page.on("request", (request) => {
                            const path = new URL(request.url()).pathname;
                            if (
                                path.startsWith("/api/stripe/") &&
                                request.method() !== "GET"
                            )
                                writes.push(path);
                        });
                        const query = new URLSearchParams({
                            ...recipe.query,
                            review_case: recipe.id,
                            review_flow: flow,
                            review_section: "topup",
                        });
                        await page.goto(`${origin}/flow-screen.html?${query}`);
                        if (recipe.steps?.length) {
                            await page.waitForFunction(
                                () =>
                                    document.documentElement.dataset
                                        .flowReviewComplete ||
                                    document.documentElement.dataset
                                        .flowReviewError,
                            );
                            expect(
                                await page
                                    .locator("html")
                                    .getAttribute("data-flow-review-error"),
                            ).toBeNull();
                        }
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
                        const node = await page.evaluate<string>(`(async () => {
                        const { observeScreen } = await import(${JSON.stringify(`/@fs/${fileURLToPath(new URL("../runtime-frame.tsx", import.meta.url))}`)});
                        return observeScreen(document)?.node;
                    })()`);
                        expect(node).toBe(recipe.pageId);
                        expect(
                            reviewPageForLocation(
                                { flow, section: "topup" },
                                { node },
                            )?.entry.id,
                        ).toBe(recipe.pageId);
                        expect(
                            getFlowFocus(flow, "topup").nodes.some(
                                (item) => item.id === node,
                            ),
                        ).toBe(true);
                        const fault = recipe.requests?.[0];
                        if (fault && !fault.method) {
                            await runtime.fetch(
                                new Request(
                                    `${origin}/__flow/review/requests`,
                                    {
                                        method: "POST",
                                        headers: {
                                            "Content-Type": "application/json",
                                        },
                                        body: "[]",
                                    },
                                ),
                            );
                            await page
                                .getByRole("button", {
                                    name: "Try again",
                                    exact: true,
                                })
                                .filter({ visible: true })
                                .first()
                                .click();
                            await page
                                .getByRole("alert")
                                .first()
                                .waitFor({ state: "hidden" });
                            await page
                                .locator('a[href^="/api/stripe/checkout/"]')
                                .waitFor();
                        } else if (fault) {
                            expect(writes).toEqual([fault.path]);
                            const action = page.getByRole("button", {
                                name: fault.path.endsWith("portal")
                                    ? "Manage billing"
                                    : "Save",
                                exact: true,
                            });
                            expect(await action.isEnabled()).toBe(true);
                            // Keep the fault active. No billing write reaches Enter.
                            // The pending case proves main accepts a duplicate click.
                            await action.click();
                            await expect.poll(() => writes.length).toBe(2);
                            expect(writes).toEqual([fault.path, fault.path]);
                            if (fault.outcome === "pending")
                                expect(
                                    await page
                                        .getByRole("switch", {
                                            name: "Turn off auto top-up",
                                            exact: true,
                                        })
                                        .isEnabled(),
                                ).toBe(false);
                            else await page.getByRole("alert").waitFor();
                        } else {
                            expect(writes).toEqual([]);
                            expect(new URL(page.url()).pathname).toBe(
                                flow === "app" ? "/top-up" : "/pollen",
                            );
                            if (
                                recipe.variant === "Checkout returned" &&
                                flow === "app"
                            ) {
                                const link = page.getByRole("link", {
                                    name: "Back to localhost",
                                    exact: true,
                                });
                                expect(await link.getAttribute("href")).toBe(
                                    `${origin}/flow-example.html`,
                                );
                            }
                        }
                        // Read real stored balances and billing preferences after
                        // clearing the read fault. Held writes never resume.
                        await runtime.fetch(
                            new Request(`${origin}/__flow/review/requests`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: "[]",
                            }),
                        );
                        const metadata = await page.evaluate(async () => {
                            const wallet = await (
                                await fetch("/api/customer/balance")
                            ).json();
                            const billing = await (
                                await fetch("/api/stripe/billing")
                            ).json();
                            return {
                                paid: wallet.packBalance,
                                quest: wallet.tierBalance,
                                enabled: billing.autoTopUp.enabled,
                            };
                        });
                        expect(metadata).toEqual({
                            paid: 10,
                            quest: 0,
                            enabled: recipe.prepare?.billing === "enabled",
                        });
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
}
