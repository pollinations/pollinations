import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { afterAll, beforeAll, expect, test } from "vitest";
import { getDeviceFlow } from "../flow-device";
import { reviewCasesForFlow, reviewPageForLocation } from "../review-inventory";
import { startRuntime } from "../runtime";
import { screenRoute } from "../screen-route";
import { openReviewContext } from "./review-browser";

const origin = "http://localhost:4180";
let runtime: Awaited<ReturnType<typeof startRuntime>>;
beforeAll(async () => {
    runtime = await startRuntime({ persist: false });
}, 60_000);
afterAll(async () => {
    await runtime?.dispose();
});

// The two credential-issuing cases require separate scoped local approval.
for (const id of [
    "device-request-app",
    "device-request-lookup",
    "device-request-invalid",
    "device-request-expired",
    "device-request-unavailable",
    "device-request-used",
    "device-submit-key",
    "device-submit-session",
    "device-submit-deny",
    "device-declined",
    "device-submit-approve",
    "device-result",
]) {
    const issuesKey = ["device-submit-approve", "device-result"].includes(id);
    test.runIf(
        process.env.FLOW_CAPTURE_TEST === "1" &&
            (!issuesKey || process.env.FLOW_DEVICE_APPROVAL_ERROR_TEST === "1"),
    )(
        `Device main behavior and recovery: ${id}`,
        async () => {
            const browser = await chromium.launch({ headless: true });
            // Both entrances share the consent page. Capture tests cover both sizes
            // and entry methods; this integration verifies their database outcomes.
            const section = "main";
            const recipe = reviewCasesForFlow("device", section).find(
                (item) => item.id === id,
            );
            if (!recipe) throw new Error(`Missing ${id}`);
            try {
                const { context, before, readState, credentialRequests } =
                    await openReviewContext(runtime, browser, recipe);
                try {
                    const page = await context.newPage();
                    const route = screenRoute(
                        new URLSearchParams(recipe.query),
                        before,
                        origin,
                    );
                    if (!route) throw new Error("Missing Device route");
                    const keyCount = async () =>
                        page.evaluate(async () => {
                            const response = await fetch("/api/api-keys");
                            if (!response.ok)
                                throw new Error(
                                    "Could not inspect local key metadata",
                                );
                            const result = await response.json();
                            return result.data.length;
                        });
                    const observe = () =>
                        page.evaluate<string>(`(async () => {
                    const { observeScreen } = await import(${JSON.stringify(`/@fs/${fileURLToPath(new URL("../runtime-frame.tsx", import.meta.url))}`)});
                    return observeScreen(document)?.node;
                })()`);
                    await page.goto(`${origin}${route}`);
                    if (
                        recipe.steps?.some(
                            (step) => step.text === "Allow access",
                        )
                    ) {
                        await page
                            .getByRole("button", {
                                name: "Allow access",
                                exact: true,
                            })
                            .click();
                    } else if (
                        id === "device-submit-deny" ||
                        id === "device-declined"
                    ) {
                        await page
                            .getByRole("button", {
                                name: "Decline",
                                exact: true,
                            })
                            .click();
                    }
                    for (const expected of recipe.expected)
                        await page
                            .locator(expected.selector)
                            .filter(
                                expected.text ? { hasText: expected.text } : {},
                            )
                            .first()
                            .waitFor();
                    const observed = await observe();
                    const visible = reviewPageForLocation(
                        { flow: "device", section },
                        { node: observed, flow: "device" },
                    );
                    expect(visible?.entry.id).toBe(recipe.pageId);
                    expect(
                        getDeviceFlow(section).map.nodeForState(observed),
                    ).toBe(recipe.family);
                    expect(await keyCount()).toBe(issuesKey ? 1 : 0);
                    expect(credentialRequests).toEqual(
                        recipe.steps?.some(
                            (step) => step.text === "Allow access",
                        )
                            ? ["/api/api-keys"]
                            : [],
                    );
                    const current = await readState();
                    if (id === "device-result") {
                        expect(current.device.status).toBe("approved");
                        const polled = await runtime.fetch(
                            new Request(`${origin}/__flow/device/poll`, {
                                method: "POST",
                            }),
                        );
                        expect(polled.ok).toBe(true);
                        await polled.body?.cancel();
                        expect((await readState()).device.status).toBe(
                            "completed",
                        );
                    } else if (id === "device-submit-deny") {
                        // Main claims success despite the injected HTTP 500.
                        expect(current.device.status).toBe("pending");
                    } else if (
                        id === "device-declined" ||
                        id === "device-request-used"
                    ) {
                        expect(current.device.status).toBe("denied");
                    } else {
                        expect(current.device).toEqual(before.device);
                        expect(
                            await page
                                .getByRole("button", {
                                    name: "Try again",
                                    exact: true,
                                })
                                .count(),
                        ).toBe(0);
                        await page
                            .getByRole("button", {
                                name: "Decline",
                                exact: true,
                            })
                            .click();
                        await page
                            .getByRole("heading", {
                                name: "Access declined",
                                exact: true,
                            })
                            .waitFor();
                        // Invalid/expired requests cannot be denied by the endpoint,
                        // yet the product still reports Access declined (G05).
                        const after = await readState();
                        expect(after.device?.status).toBe(
                            id === "device-request-invalid"
                                ? before.device?.status
                                : id === "device-request-expired"
                                  ? "expired"
                                  : "denied",
                        );
                        // A failed approval leaves its minted key behind (G06).
                        expect(await keyCount()).toBe(issuesKey ? 1 : 0);
                    }
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
