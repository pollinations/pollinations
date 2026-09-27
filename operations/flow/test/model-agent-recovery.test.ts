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

for (const section of ["models", "agents"]) {
    const kind = section === "models" ? "model" : "agent";
    for (const recipe of reviewCasesForFlow("account", section).filter(
        (recipe) =>
            [
                "Failed",
                "Deleting",
                "Updating visibility",
                "Visibility update failed",
                "Load failed",
                "Code creation failed",
                "Code save failed",
                "Code sync failed",
            ].includes(recipe.variant ?? ""),
    )) {
        test.runIf(process.env.FLOW_CAPTURE_TEST === "1")(
            `Models/Agents recovery: ${recipe.id}`,
            async () => {
                expect(recipe.requests?.length).toBeGreaterThan(0);
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
                        for (const expected of recipe.expected) {
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
                        }
                        const observe = () =>
                            page.evaluate<string>(`(async () => {
                            const { observeScreen } = await import(${JSON.stringify(`/@fs/${fileURLToPath(new URL("../runtime-frame.tsx", import.meta.url))}`)});
                            return observeScreen(document)?.node;
                        })()`);
                        const form = /-(create|edit)$/.test(recipe.pageId);
                        const node = form ? recipe.pageId : section;
                        expect(await observe()).toBe(node);
                        expect(
                            reviewPageForLocation(
                                { flow: "account", section },
                                { node, flow: "account" },
                            )?.entry.id,
                        ).toBe(node);
                        expect(
                            getDashboardFlow(section).nodes.some(
                                (item) => item.id === node,
                            ),
                        ).toBe(true);

                        if (recipe.variant === "Load failed") {
                            // Remove the declared fault, then let the real Retry
                            // action fetch both collections again.
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
                                .first()
                                .click();
                            await page.locator(`#${section}`).waitFor();
                            expect(await page.getByRole("alert").count()).toBe(
                                0,
                            );
                        } else if (form) {
                            await page
                                .getByRole("button", {
                                    name: "Cancel",
                                    exact: true,
                                })
                                .click();
                            await page
                                .getByRole("dialog")
                                .waitFor({ state: "hidden" });
                        } else {
                            expect(await page.getByRole("dialog").count()).toBe(
                                0,
                            );
                            const updating =
                                recipe.variant === "Updating visibility";
                            const action = page.getByRole("button", {
                                name: updating
                                    ? "Saving visibility"
                                    : `${recipe.pageId.endsWith("-delete") ? "Delete" : "Unlist"} ${kind}`,
                                exact: true,
                            });
                            expect(await action.isEnabled()).toBe(!updating);
                            if (!updating) {
                                // This also records main's lack of a pending
                                // deletion guard: its confirmation can reopen.
                                await action.click();
                                expect(await observe()).toBe(recipe.pageId);
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
                        }
                        expect(await observe()).toBe(section);
                        // Clear remaining held faults only after checking their
                        // UI. Read metadata through Enter, never ciphertext.
                        await runtime.fetch(
                            new Request(`${origin}/__flow/review/requests`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: "[]",
                            }),
                        );
                        const records = await page.evaluate(async () => {
                            const response = await fetch(
                                "/api/account/my-models",
                            );
                            if (!response.ok)
                                throw new Error("Model metadata unavailable");
                            const { data } = await response.json();
                            return data
                                .map(
                                    (item: {
                                        id: string;
                                        title: string;
                                        hidden: boolean;
                                    }) => ({
                                        id: item.id,
                                        title: item.title,
                                        hidden: item.hidden,
                                    }),
                                )
                                .sort((a: { id: string }, b: { id: string }) =>
                                    a.id.localeCompare(b.id),
                                );
                        });
                        expect(records).toEqual([
                            {
                                id: "flow-review-agent",
                                title: "Example agent",
                                hidden: false,
                            },
                            {
                                id: "flow-review-model",
                                title: "Example model",
                                hidden: false,
                            },
                        ]);
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
