// @vitest-environment jsdom

import { PolliProvider } from "@pollinations/sdk/react";
import {
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppUserMenu } from "./AppUserMenu.tsx";

function tokenStorage() {
    const values = new Map<string, string>([
        ["polli:pk_test:token", "sk_test"],
    ]);
    return {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
    };
}

function balanceResponse() {
    return new Response(
        JSON.stringify({
            balance: 5,
            scope: "account",
            keyBudget: null,
            accountBalance: 5,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
    );
}

async function renderOpenMenu(fetchMock: ReturnType<typeof vi.fn>) {
    vi.stubGlobal("fetch", fetchMock);
    render(
        <PolliProvider
            appKey="pk_test"
            storage={tokenStorage()}
            enterUrl="https://enter.example"
        >
            <AppUserMenu />
        </PolliProvider>,
    );
    const trigger = await screen.findByRole("button", {
        name: "App user menu",
    });
    fireEvent.click(trigger);
    return screen.findByRole("button", { name: "Buy 5 Pollen" });
}

beforeEach(() => {
    vi.stubGlobal(
        "ResizeObserver",
        class {
            observe() {}
            unobserve() {}
            disconnect() {}
        },
    );
});

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    window.sessionStorage.clear();
    window.history.replaceState({}, "", "/");
});

describe("AppUserMenu", () => {
    it("starts the p5 top-up and shows its pending state", async () => {
        let resolveIntent: ((response: Response) => void) | undefined;
        const fetchMock = vi.fn(
            (input: RequestInfo | URL, _init?: RequestInit) => {
                if (String(input).endsWith("/account/balance")) {
                    return Promise.resolve(balanceResponse());
                }
                return new Promise<Response>((resolve) => {
                    resolveIntent = resolve;
                });
            },
        );
        const addButton = await renderOpenMenu(fetchMock);
        expect(addButton.querySelector("svg")).not.toBeNull();
        const dashboardLink = screen.getByRole("link", {
            name: "Open dashboard",
        });
        expect(dashboardLink.getAttribute("href")).toBe(
            "https://enter.example/pollen",
        );
        expect(dashboardLink.getAttribute("target")).toBe("_blank");
        expect(dashboardLink.querySelector("svg")).not.toBeNull();
        expect(
            screen
                .getByRole("button", { name: "Log out from this app" })
                .querySelector("svg"),
        ).not.toBeNull();

        fireEvent.click(addButton);

        const pendingButton = await screen.findByRole("button", {
            name: "Opening checkout…",
        });
        expect(pendingButton.hasAttribute("disabled")).toBe(true);
        expect(pendingButton.getAttribute("aria-busy")).toBe("true");
        const intentCall = fetchMock.mock.calls.find(([input]) =>
            String(input).endsWith("/stripe/top-up-intents"),
        );
        expect(intentCall).toBeTruthy();
        expect(JSON.parse(String(intentCall?.[1]?.body))).toMatchObject({
            packKey: "p5",
        });

        resolveIntent?.(
            new Response(JSON.stringify({ url: "#checkout" }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            }),
        );
        await waitFor(() => expect(window.location.hash).toBe("#checkout"));
        await waitFor(() =>
            expect(
                screen
                    .getByRole("button", { name: "Buy 5 Pollen" })
                    .hasAttribute("disabled"),
            ).toBe(false),
        );
    });

    it("restores the action and shows an alert when intent creation fails", async () => {
        const fetchMock = vi.fn((input: RequestInfo | URL) => {
            if (String(input).endsWith("/account/balance")) {
                return Promise.resolve(balanceResponse());
            }
            return Promise.resolve(
                new Response(
                    JSON.stringify({
                        status: 503,
                        success: false,
                        error: {
                            code: "SERVICE_UNAVAILABLE",
                            message: "Top-up unavailable",
                        },
                    }),
                    {
                        status: 503,
                        headers: { "Content-Type": "application/json" },
                    },
                ),
            );
        });
        const addButton = await renderOpenMenu(fetchMock);

        fireEvent.click(addButton);

        expect((await screen.findByRole("alert")).textContent).toContain(
            "Could not open checkout. Please try again.",
        );
        await waitFor(() =>
            expect(
                screen
                    .getByRole("button", { name: "Buy 5 Pollen" })
                    .hasAttribute("disabled"),
            ).toBe(false),
        );
    });

    it.each([
        ["success", "Payment submitted"],
        ["canceled", "Payment canceled"],
    ] as const)("renders a validated %s return", async (status, copy) => {
        const state = `state_${status}`;
        window.sessionStorage.setItem("polli:pk_test:topup_state", state);
        window.history.replaceState(
            {},
            "",
            `/?topup=${status}&topup_state=${state}`,
        );
        const fetchMock = vi.fn(() => Promise.resolve(balanceResponse()));

        await renderOpenMenu(fetchMock);

        expect(screen.getByText(new RegExp(copy))).toBeTruthy();
    });
});
