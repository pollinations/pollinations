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
const clearFaults = () =>
    runtime.fetch(
        new Request(`${origin}/__flow/review/requests`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "[]",
        }),
    );

for (const section of ["account", "quests"] as const) {
    for (const recipe of reviewCasesForFlow("account", section).filter(
        (item) => item.requests?.length || item.variant === "Quests available",
    )) {
        test.runIf(process.env.FLOW_CAPTURE_TEST === "1")(
            `Settings and Quests recovery: ${recipe.id}`,
            async () => {
                const browser = await chromium.launch({ headless: true });
                try {
                    const { context, before, readState, credentialRequests } =
                        await openReviewContext(runtime, browser, recipe);
                    try {
                        const page = await context.newPage();
                        page.setDefaultTimeout(10_000);
                        const writes: string[] = [];
                        const checks: Promise<{ success: boolean }>[] = [];
                        page.on("request", (request) => {
                            if (
                                request.method() !== "GET" &&
                                /^\/api\/(?:auth|account\/integrations|quests)(?:\/|$)/.test(
                                    new URL(request.url()).pathname,
                                )
                            )
                                writes.push(new URL(request.url()).pathname);
                        });
                        page.on("response", (response) => {
                            if (
                                new URL(response.url()).pathname ===
                                    "/api/quests/check" &&
                                response.ok()
                            )
                                checks.push(response.json());
                        });
                        await page.goto(
                            `${origin}/flow-screen.html?${new URLSearchParams({ ...recipe.query, review_case: recipe.id, review_flow: "account", review_section: section })}`,
                        );
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
                                { flow: "account", section },
                                { node },
                            )?.entry.id,
                        ).toBe(node);
                        expect(
                            getFlowFocus("account", section).nodes.some(
                                (item) => item.id === node,
                            ),
                        ).toBe(true);
                        const fault = recipe.requests?.[0];
                        if (section === "account") {
                            if (
                                fault?.method === "POST" ||
                                fault?.method === "DELETE"
                            ) {
                                const step = recipe.steps
                                    ?.filter((step) => step.action === "click")
                                    .at(-1);
                                if (!step)
                                    throw new Error("Missing account action");
                                const pendingName =
                                    recipe.variant === "Signing out"
                                        ? "Signing out…"
                                        : recipe.pageId === "account-delete"
                                          ? "Deleting…"
                                          : "Working...";
                                const control =
                                    fault.outcome === "pending" && step.text
                                        ? page
                                              .getByRole("button", {
                                                  name: pendingName,
                                                  exact: true,
                                              })
                                              .filter({ visible: true })
                                        : page
                                              .locator(step.selector)
                                              .filter({
                                                  ...(step.text
                                                      ? { hasText: step.text }
                                                      : {}),
                                                  visible: true,
                                              })
                                              .first();
                                expect(writes).toEqual([
                                    fault.path.replace(
                                        "*",
                                        "flow-review-integration",
                                    ),
                                ]);
                                expect(await control.isEnabled()).toBe(
                                    fault.outcome !== "pending",
                                );
                                if (fault.outcome !== "pending") {
                                    await control.click();
                                    await expect
                                        .poll(() => writes.length)
                                        .toBe(2);
                                    if (recipe.pageId === "account-delete") {
                                        await page
                                            .getByRole("button", {
                                                name: "Cancel",
                                                exact: true,
                                            })
                                            .click();
                                        await page
                                            .getByRole("dialog")
                                            .waitFor({ state: "hidden" });
                                    }
                                } else if (recipe.pageId === "account-delete") {
                                    expect(
                                        await page
                                            .getByRole("button", {
                                                name: "Cancel",
                                                exact: true,
                                            })
                                            .isDisabled(),
                                    ).toBe(true);
                                }
                            } else if (fault?.outcome !== "pending") {
                                const retry = page
                                    .getByRole("button", {
                                        name: "Try again",
                                        exact: true,
                                    })
                                    .filter({ visible: true });
                                expect(await retry.count()).toBe(
                                    fault?.path === "/api/account/profile"
                                        ? 1
                                        : 0,
                                );
                                await clearFaults();
                                if (fault?.path === "/api/account/profile")
                                    await retry.click();
                                else await page.reload();
                                await page
                                    .getByRole("button", {
                                        name: recipe.prepare?.discord
                                            ? "Disconnect Discord"
                                            : "Connect Discord",
                                        exact: true,
                                    })
                                    .waitFor();
                                await page
                                    .getByRole("button", {
                                        name: "Connect GitHub",
                                        exact: true,
                                    })
                                    .waitFor();
                                await page
                                    .getByRole("alert")
                                    .waitFor({ state: "hidden" });
                            }
                            const after = await readState();
                            expect(after.wallet).toEqual(before.wallet);
                            expect(after.conditions.account).toBe("signed-in");
                            expect(after.connection).toEqual(before.connection);
                        } else {
                            const reward = () =>
                                page.evaluate(async () => {
                                    const { rewards } = await (
                                        await fetch("/api/quests/rewards")
                                    ).json();
                                    return rewards.find(
                                        (item: { id: string }) =>
                                            item.id === "flow-review-reward",
                                    );
                                });
                            if (recipe.variant === "Claiming") {
                                expect(
                                    await page
                                        .getByRole("button", {
                                            name: "Claiming",
                                            exact: true,
                                        })
                                        .filter({ visible: true })
                                        .isDisabled(),
                                ).toBe(true);
                                expect((await reward()).claimedAt).toBeNull();
                                expect(
                                    writes.filter((path) =>
                                        path.endsWith("/claim"),
                                    ),
                                ).toHaveLength(1);
                            } else if (
                                recipe.variant === "Claim failed" ||
                                recipe.variant === "Quests available"
                            ) {
                                await page
                                    .getByText("Refreshing quests…", {
                                        exact: true,
                                    })
                                    .waitFor({ state: "hidden" });
                                await expect.poll(() => checks.length).toBe(1);
                                expect((await checks[0]).success).toBe(true);
                                expect((await reward()).claimedAt).toBeNull();
                                const walletBefore = (await readState()).wallet;
                                const sidebarQuest = page
                                    .locator(
                                        'aside [data-theme="accent"] > div',
                                    )
                                    .filter({
                                        has: page.getByText("Quest", {
                                            exact: true,
                                        }),
                                    })
                                    .locator("span.tabular-nums")
                                    .first();
                                const displayedBefore =
                                    await sidebarQuest.innerText();
                                await clearFaults();
                                await page
                                    .getByRole("button", {
                                        name: "Claim",
                                        exact: true,
                                    })
                                    .filter({ visible: true })
                                    .click();
                                await page
                                    .getByRole("button", {
                                        name: "Claiming",
                                        exact: true,
                                    })
                                    .filter({ visible: true })
                                    .waitFor({ state: "hidden" });
                                await expect
                                    .poll(
                                        async () => (await reward()).claimedAt,
                                    )
                                    .not.toBeNull();
                                expect(
                                    (await readState()).wallet.questPollen,
                                ).toBe(walletBefore.questPollen + 5);
                                const repeated = await page.evaluate(
                                    async () => {
                                        const response = await fetch(
                                            "/api/quests/rewards/flow-review-reward/claim",
                                            { method: "POST" },
                                        );
                                        return {
                                            status: response.status,
                                            body: await response.json(),
                                        };
                                    },
                                );
                                expect(repeated).toMatchObject({
                                    status: 200,
                                    body: { claimed: false },
                                });
                                expect(
                                    (await readState()).wallet.questPollen,
                                ).toBe(walletBefore.questPollen + 5);
                                await page
                                    .getByRole("button", {
                                        name: "Claim",
                                        exact: true,
                                    })
                                    .filter({ visible: true })
                                    .waitFor({ state: "hidden" });
                                // Main refreshes rewards, but not the dashboard's wallet loader.
                                expect(await sidebarQuest.innerText()).toBe(
                                    displayedBefore,
                                );
                                await page.reload();
                                await expect
                                    .poll(async () =>
                                        Number(await sidebarQuest.innerText()),
                                    )
                                    .toBe(walletBefore.questPollen + 5);
                            } else if (recipe.variant === "Check unavailable") {
                                expect(
                                    await page.getByRole("alert").count(),
                                ).toBe(0);
                                expect(
                                    await page
                                        .getByRole("button", {
                                            name: "Claim",
                                            exact: true,
                                        })
                                        .filter({ visible: true })
                                        .isEnabled(),
                                ).toBe(true);
                                expect(writes).toEqual(["/api/quests/check"]);
                                expect((await reward()).claimedAt).toBeNull();
                            } else if (fault?.outcome !== "pending") {
                                expect(
                                    await page
                                        .getByRole("button", {
                                            name: "Try again",
                                            exact: true,
                                        })
                                        .count(),
                                ).toBe(0);
                                expect(
                                    (await readState()).conditions.account,
                                ).toBe("signed-in");
                                await clearFaults();
                                await page.reload();
                                await page
                                    .getByRole("button", {
                                        name: "Claim",
                                        exact: true,
                                    })
                                    .filter({ visible: true })
                                    .waitFor();
                                await page
                                    .getByRole("alert")
                                    .waitFor({ state: "hidden" });
                            }
                        }
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
