import { act, create } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAuthActions, useAuthState } from "./hooks.js";
import { PolliProvider } from "./PolliProvider.js";
import type { StorageAdapter } from "./storage.js";

function memoryStorage(): StorageAdapter {
    const values = new Map<string, string>();
    return {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
        removeItem: (key) => values.delete(key),
    };
}

function read<T>(value: T | null): T {
    if (!value) throw new Error("Expected hook value to be set");
    return value;
}

function stubWindow(href: string) {
    const url = new URL(href);
    const sessionStorage = memoryStorage();
    const win: Record<string, unknown> = {
        location: {
            href,
            hash: url.hash,
            pathname: url.pathname,
            search: url.search,
            assign: vi.fn(),
        },
        history: {
            replaceState: vi.fn(),
        },
        sessionStorage,
    };
    vi.stubGlobal("window", win);
    return { win, sessionStorage };
}

async function renderProvider(appKey: string) {
    await act(async () => {
        create(
            <PolliProvider appKey={appKey} storage={memoryStorage()}>
                <div />
            </PolliProvider>,
        );
    });
}

describe("PolliProvider setup guidance", () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it("warns when appKey is not a publishable key", async () => {
        stubWindow("http://127.0.0.1:4178/");
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        vi.spyOn(console, "info").mockImplementation(() => {});

        await renderProvider("sk_secret_test");

        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining("publishable pk_ App Key"),
        );
        expect(warn.mock.calls[0][0]).not.toContain("sk_secret_test");
    });

    it("persists the key to the provided storage", async () => {
        stubWindow("https://app.example/");
        const spy: StorageAdapter = {
            getItem: vi.fn(() => null),
            setItem: vi.fn(),
            removeItem: vi.fn(),
        };
        let setApiKey: ((key: string | null) => void) | null = null;
        function Grab() {
            setApiKey = useAuthActions().setApiKey;
            return null;
        }

        await act(async () => {
            create(
                <PolliProvider appKey="pk_test" storage={spy}>
                    <Grab />
                </PolliProvider>,
            );
        });
        act(() => setApiKey?.("sk_live"));

        expect(spy.setItem).toHaveBeenCalledWith(
            "polli:pk_test:token",
            "sk_live",
        );
    });

    it("creates a canonical top-up intent and navigates to Enter", async () => {
        const { win, sessionStorage } = stubWindow(
            "https://app.example/path?view=grid&topup=success&topup_state=stale#editor",
        );
        const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(() =>
            Promise.resolve(
                new Response(
                    JSON.stringify({
                        url: "https://enter.example/api/stripe/top-up/token",
                    }),
                    {
                        status: 200,
                        headers: { "Content-Type": "application/json" },
                    },
                ),
            ),
        );
        let actions: ReturnType<typeof useAuthActions> | null = null;
        function Grab() {
            actions = useAuthActions();
            return null;
        }

        await act(async () => {
            create(
                <PolliProvider
                    appKey="pk_test"
                    storage={memoryStorage()}
                    enterUrl="https://enter.example"
                >
                    <Grab />
                </PolliProvider>,
            );
        });
        act(() => actions?.setApiKey("sk_delegated"));
        await act(async () => {
            await actions?.topUp();
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [requestUrl, init] = fetchMock.mock.calls[0];
        expect(requestUrl).toBe(
            "https://enter.example/api/stripe/top-up-intents",
        );
        expect(init?.headers).toEqual({
            Authorization: "Bearer sk_delegated",
            "Content-Type": "application/json",
        });
        const body = JSON.parse(String(init?.body));
        expect(body).toMatchObject({
            packKey: "p5",
            returnUri: "https://app.example/path?view=grid",
        });
        expect(body.topupState).toMatch(/^[A-Za-z0-9_-]+$/);
        expect(sessionStorage.getItem("polli:pk_test:topup_state")).toBe(
            body.topupState,
        );
        expect(
            (win.location as { assign: ReturnType<typeof vi.fn> }).assign,
        ).toHaveBeenCalledWith("https://enter.example/api/stripe/top-up/token");

        await act(async () => {
            await actions?.topUp();
        });
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("exposes only a top-up return with a matching session nonce", async () => {
        const { win, sessionStorage } = stubWindow(
            "https://app.example/?topup=success&topup_state=expected",
        );
        sessionStorage.setItem("polli:pk_test:topup_state", "expected");
        let state: ReturnType<typeof useAuthState> | null = null;
        function Grab() {
            state = useAuthState();
            return null;
        }

        await act(async () => {
            create(
                <PolliProvider appKey="pk_test" storage={memoryStorage()}>
                    <Grab />
                </PolliProvider>,
            );
        });

        expect(read<ReturnType<typeof useAuthState>>(state).topUpStatus).toBe(
            "success",
        );
        expect(sessionStorage.getItem("polli:pk_test:topup_state")).toBeNull();
        expect(
            (win.history as { replaceState: ReturnType<typeof vi.fn> })
                .replaceState,
        ).toHaveBeenCalledWith({}, "", "/");
    });

    it("preserves a captured top-up status when hydration runs again", async () => {
        const { win, sessionStorage } = stubWindow(
            "https://app.example/?topup=success&topup_state=expected",
        );
        sessionStorage.setItem("polli:pk_test:topup_state", "expected");
        let state: ReturnType<typeof useAuthState> | null = null;
        function Grab() {
            state = useAuthState();
            return null;
        }

        let renderer: ReturnType<typeof create>;
        await act(async () => {
            renderer = create(
                <PolliProvider appKey="pk_test" storage={memoryStorage()}>
                    <Grab />
                </PolliProvider>,
            );
        });
        Object.assign(win.location as Record<string, unknown>, {
            href: "https://app.example/",
            hash: "",
            pathname: "/",
            search: "",
        });

        await act(async () => {
            renderer.update(
                <PolliProvider appKey="pk_test" storage={memoryStorage()}>
                    <Grab />
                </PolliProvider>,
            );
        });

        expect(read<ReturnType<typeof useAuthState>>(state).topUpStatus).toBe(
            "success",
        );
    });

    it("blocks concurrent top-ups and only removes the failing call's nonce", async () => {
        const { sessionStorage } = stubWindow("https://app.example/");
        let rejectFetch: (reason: Error) => void = () => {
            throw new Error("Expected fetch to be pending");
        };
        vi.spyOn(globalThis, "fetch").mockImplementation(
            () =>
                new Promise<Response>((_resolve, reject) => {
                    rejectFetch = reject;
                }),
        );
        let actions: ReturnType<typeof useAuthActions> | null = null;
        function Grab() {
            actions = useAuthActions();
            return null;
        }

        await act(async () => {
            create(
                <PolliProvider appKey="pk_test" storage={memoryStorage()}>
                    <Grab />
                </PolliProvider>,
            );
        });
        act(() =>
            read<ReturnType<typeof useAuthActions>>(actions).setApiKey(
                "sk_delegated",
            ),
        );
        const authActions = read<ReturnType<typeof useAuthActions>>(actions);

        const first = authActions.topUp();
        await expect(authActions.topUp()).rejects.toThrow(
            "Checkout is already opening",
        );
        sessionStorage.setItem("polli:pk_test:topup_state", "newer-state");
        rejectFetch(new Error("intent failed"));
        await expect(first).rejects.toThrow("intent failed");

        expect(sessionStorage.getItem("polli:pk_test:topup_state")).toBe(
            "newer-state",
        );
    });

    it("clears a validated top-up status after the balance refresh window", async () => {
        vi.useFakeTimers();
        const { sessionStorage } = stubWindow(
            "https://app.example/?topup=success&topup_state=expected",
        );
        sessionStorage.setItem("polli:pk_test:topup_state", "expected");
        let state: ReturnType<typeof useAuthState> | null = null;
        function Grab() {
            state = useAuthState();
            return null;
        }

        await act(async () => {
            create(
                <PolliProvider appKey="pk_test" storage={memoryStorage()}>
                    <Grab />
                </PolliProvider>,
            );
        });

        act(() => {
            vi.advanceTimersByTime(14_999);
        });
        expect(read<ReturnType<typeof useAuthState>>(state).topUpStatus).toBe(
            "success",
        );

        act(() => {
            vi.advanceTimersByTime(1);
        });
        expect(read<ReturnType<typeof useAuthState>>(state).topUpStatus).toBe(
            null,
        );
    });
});
