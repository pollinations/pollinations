import { StrictMode } from "react";
import { act, create } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAuth, useAuthActions } from "./hooks.js";
import { PolliProvider } from "./PolliProvider.js";
import type { StorageAdapter } from "./storage.js";

function memoryStorage(initial: Record<string, string> = {}) {
    const values = new Map(Object.entries(initial));
    return {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
        snapshot: () => Object.fromEntries(values),
    } satisfies StorageAdapter & { snapshot(): Record<string, string> };
}

function stubWindow(href: string) {
    const url = new URL(href);
    const win: Record<string, unknown> = {
        location: {
            href,
            hash: url.hash,
            pathname: url.pathname,
            search: url.search,
        },
        history: {
            replaceState: vi.fn(),
        },
    };
    vi.stubGlobal("window", win);
    return win;
}

describe("PolliProvider", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it("warns when appKey is not a publishable key", async () => {
        stubWindow("http://127.0.0.1:4178/");
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        vi.spyOn(console, "info").mockImplementation(() => {});

        await act(async () => {
            create(
                <PolliProvider
                    appKey="sk_secret_test"
                    storage={memoryStorage()}
                >
                    <div />
                </PolliProvider>,
            );
        });

        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining("publishable pk_ App Key"),
        );
        expect(warn.mock.calls[0][0]).not.toContain("sk_secret_test");
    });

    it("starts PKCE with a stable callback and remembers the current route", async () => {
        const win = stubWindow("https://app.example/?view=models#/details");
        const storage = memoryStorage();
        let login: (() => void) | null = null;

        function GrabLogin() {
            login = useAuthActions().login;
            return null;
        }

        await act(async () => {
            create(
                <PolliProvider appKey="pk_test" storage={storage}>
                    <GrabLogin />
                </PolliProvider>,
            );
        });
        await act(async () => {
            login?.();
            await vi.waitFor(() => {
                expect(
                    new URL((win.location as { href: string }).href).pathname,
                ).toBe("/authorize");
            });
        });

        const authorizeUrl = new URL((win.location as { href: string }).href);
        expect(authorizeUrl.pathname).toBe("/authorize");
        expect(authorizeUrl.searchParams.get("response_type")).toBe("code");
        expect(authorizeUrl.searchParams.get("redirect_uri")).toBe(
            "https://app.example/",
        );
        expect(authorizeUrl.searchParams.get("code_challenge_method")).toBe(
            "S256",
        );
        expect(authorizeUrl.searchParams.get("code_challenge")).toMatch(
            /^[A-Za-z0-9_-]{43}$/,
        );
        expect(storage.snapshot()).toMatchObject({
            "polli:pk_test:oauth_return_path": "/?view=models#/details",
        });
    });

    it("ignores repeated login calls while a redirect is pending", async () => {
        stubWindow("https://app.example/");
        const storage = memoryStorage();
        let login: (() => void) | null = null;

        function GrabLogin() {
            login = useAuthActions().login;
            return null;
        }

        await act(async () => {
            create(
                <PolliProvider appKey="pk_test" storage={storage}>
                    <GrabLogin />
                </PolliProvider>,
            );
        });

        await act(async () => {
            login?.();
            const pendingLogin = storage.snapshot();
            expect(pendingLogin["polli:pk_test:oauth_state"]).toBeTruthy();
            expect(pendingLogin["polli:pk_test:oauth_verifier"]).toBeTruthy();
            login?.();
            expect(storage.snapshot()).toEqual(pendingLogin);
        });
    });

    it("exchanges the callback code once and restores the original route", async () => {
        const win = stubWindow(
            "https://app.example/?code=single-use&state=expected",
        );
        const storage = memoryStorage({
            "polli:pk_test:oauth_state": "expected",
            "polli:pk_test:oauth_verifier": "v".repeat(64),
            "polli:pk_test:oauth_return_path": "/?view=models#/details",
        });
        const fetchMock = vi.fn<typeof fetch>(async () =>
            Response.json({
                access_token: "sk_delegated",
                token_type: "bearer",
            }),
        );
        vi.stubGlobal("fetch", fetchMock);
        const auth: { current: ReturnType<typeof useAuth> | null } = {
            current: null,
        };

        function GrabAuth() {
            auth.current = useAuth();
            return null;
        }

        await act(async () => {
            create(
                <StrictMode>
                    <PolliProvider appKey="pk_test" storage={storage}>
                        <GrabAuth />
                    </PolliProvider>
                </StrictMode>,
            );
            await new Promise((resolve) => setTimeout(resolve, 0));
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [, request] = fetchMock.mock.calls[0];
        const form = new URLSearchParams(String(request?.body));
        expect(form.get("grant_type")).toBe("authorization_code");
        expect(form.get("code")).toBe("single-use");
        expect(form.get("client_id")).toBe("pk_test");
        expect(form.get("redirect_uri")).toBe("https://app.example/");
        expect(form.get("code_verifier")).toBe("v".repeat(64));
        expect(storage.snapshot()).toEqual({
            "polli:pk_test:token": "sk_delegated",
        });
        expect(
            (win.history as { replaceState: ReturnType<typeof vi.fn> })
                .replaceState,
        ).toHaveBeenCalledWith({}, "", "/?view=models#/details");
        expect(auth.current?.apiKey).toBe("sk_delegated");
        expect(auth.current?.isHydrated).toBe(true);
    });

    it.each([
        ["?code=code&state=wrong", "verifier", "Invalid OAuth state"],
        ["?code=code&state=expected", null, "Missing PKCE verifier"],
        ["?error=access_denied&state=expected", "verifier", "access_denied"],
        ["?code=code&state=expected", "verifier", "Code expired"],
    ])("exposes callback failure without claiming a connection: %s", async (query, verifier, expected) => {
        stubWindow(`https://app.example/${query}`);
        vi.spyOn(console, "warn").mockImplementation(() => {});
        const storage = memoryStorage({
            "polli:pk_test:oauth_state": "expected",
            ...(verifier ? { "polli:pk_test:oauth_verifier": verifier } : {}),
        });
        const fetchMock = vi.fn<typeof fetch>(async () =>
            Response.json(
                { error: "invalid_grant", error_description: "Code expired" },
                { status: 400 },
            ),
        );
        vi.stubGlobal("fetch", fetchMock);
        const auth: { current: ReturnType<typeof useAuth> | null } = {
            current: null,
        };
        function GrabAuth() {
            auth.current = useAuth();
            return null;
        }
        await act(async () => {
            create(
                <PolliProvider appKey="pk_test" storage={storage}>
                    <GrabAuth />
                </PolliProvider>,
            );
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
        expect(auth.current?.error?.message).toBe(expected);
        expect(auth.current?.isLoggedIn).toBe(false);
        expect(auth.current?.isHydrated).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(
            expected === "Code expired" ? 1 : 0,
        );
        expect(storage.getItem("polli:pk_test:token")).toBeNull();
    });

    it("checks a stored key once before reporting a connected account", async () => {
        stubWindow("https://app.example/");
        const storage = memoryStorage({ "polli:pk_test:token": "sk_stored" });
        let complete: (response: Response) => void = () => {};
        const fetchMock = vi.fn<typeof fetch>(
            () =>
                new Promise((resolve) => {
                    complete = resolve;
                }),
        );
        vi.stubGlobal("fetch", fetchMock);
        const auth: { current: ReturnType<typeof useAuth> | null } = {
            current: null,
        };
        function Probe() {
            auth.current = useAuth();
            return null;
        }
        await act(async () => {
            create(
                <StrictMode>
                    <PolliProvider
                        appKey="pk_test"
                        storage={storage}
                        apiBaseUrl="https://enter.example/api/"
                    >
                        <Probe />
                    </PolliProvider>
                </StrictMode>,
            );
        });
        expect(auth.current?.isHydrated).toBe(false);
        expect(auth.current?.isLoggedIn).toBe(false);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(
            "https://enter.example/api/account/key",
            { headers: { Authorization: "Bearer sk_stored" } },
        );
        await act(async () => {
            complete(Response.json({ valid: true }));
        });
        expect(auth.current?.isHydrated).toBe(true);
        expect(auth.current?.isLoggedIn).toBe(true);
        expect(storage.getItem("polli:pk_test:token")).toBe("sk_stored");
    });

    it.each([
        ["expired", 401],
        ["revoked", 401],
        ["unavailable", 503],
        ["forbidden", 403],
        ["network", 0],
    ] as const)("recovers from a %s stored key check without mistaking outages for revocation", async (_reason, status) => {
        stubWindow("https://app.example/");
        const storage = memoryStorage({ "polli:pk_test:token": "sk_stored" });
        vi.stubGlobal(
            "fetch",
            vi.fn<typeof fetch>(async () => {
                if (!status) throw new TypeError("Network unavailable");
                return Response.json(
                    { error: { message: _reason } },
                    { status },
                );
            }),
        );
        const auth: { current: ReturnType<typeof useAuth> | null } = {
            current: null,
        };
        function Probe() {
            auth.current = useAuth();
            return null;
        }
        await act(async () => {
            create(
                <PolliProvider appKey="pk_test" storage={storage}>
                    <Probe />
                </PolliProvider>,
            );
        });
        expect(auth.current?.isHydrated).toBe(true);
        expect(auth.current?.isLoggedIn).toBe(false);
        expect(storage.getItem("polli:pk_test:token")).toBe(
            status === 401 ? null : "sk_stored",
        );
        if (status === 401) expect(auth.current?.error).toBeNull();
        else expect(auth.current?.error).toBeInstanceOf(Error);
    });

    it.each([
        null,
        "sk_new",
    ])("does not overwrite a later key change (%s) when validation completes", async (nextKey) => {
        stubWindow("https://app.example/");
        const storage = memoryStorage({ "polli:pk_test:token": "sk_stored" });
        let complete: (response: Response) => void = () => {};
        vi.stubGlobal(
            "fetch",
            vi.fn<typeof fetch>(
                () =>
                    new Promise((resolve) => {
                        complete = resolve;
                    }),
            ),
        );
        const auth: { current: ReturnType<typeof useAuth> | null } = {
            current: null,
        };
        function Probe() {
            auth.current = useAuth();
            return null;
        }
        await act(async () => {
            create(
                <PolliProvider appKey="pk_test" storage={storage}>
                    <Probe />
                </PolliProvider>,
            );
        });
        await act(async () => {
            auth.current?.setApiKey(nextKey);
        });
        await act(async () => {
            complete(Response.json({ valid: true }));
        });
        expect(auth.current?.apiKey).toBe(nextKey);
        expect(auth.current?.isHydrated).toBe(true);
        expect(storage.getItem("polli:pk_test:token")).toBe(nextKey);
    });

    it("retries a temporary key-check failure with the same key, without restarting OAuth", async () => {
        const win = stubWindow("https://app.example/");
        const storage = memoryStorage({ "polli:pk_test:token": "sk_stored" });
        let complete: (response: Response) => void = () => {};
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(
                Response.json(
                    { error: { message: "Unavailable" } },
                    { status: 503 },
                ),
            )
            .mockImplementation(
                () =>
                    new Promise((resolve) => {
                        complete = resolve;
                    }),
            );
        vi.stubGlobal("fetch", fetchMock);
        const auth: { current: ReturnType<typeof useAuth> | null } = {
            current: null,
        };
        function Probe() {
            auth.current = useAuth();
            return null;
        }
        await act(async () => {
            create(
                <PolliProvider appKey="pk_test" storage={storage}>
                    <Probe />
                </PolliProvider>,
            );
        });
        expect(auth.current?.retryConnection).toBeTypeOf("function");
        expect(storage.snapshot()).toEqual({
            "polli:pk_test:token": "sk_stored",
        });
        const retry = auth.current?.retryConnection;
        await act(async () => {
            retry?.();
            retry?.();
        });
        expect(auth.current?.isHydrated).toBe(false);
        expect(auth.current?.error).toBeNull();
        expect(fetchMock).toHaveBeenCalledTimes(2);
        await act(async () => {
            complete(Response.json({ valid: true }));
        });
        expect(auth.current?.isLoggedIn).toBe(true);
        expect(auth.current?.retryConnection).toBeNull();
        expect(auth.current?.error).toBeNull();
        expect(storage.snapshot()).toEqual({
            "polli:pk_test:token": "sk_stored",
        });
        expect((win.location as { href: string }).href).toBe(
            "https://app.example/",
        );
        for (const [url, options] of fetchMock.mock.calls) {
            expect(url).toBe("https://enter.pollinations.ai/api/account/key");
            expect(options?.headers).toEqual({
                Authorization: "Bearer sk_stored",
            });
        }
    });

    it("persists keys set by the host app", async () => {
        stubWindow("https://app.example/");
        const storage = memoryStorage();
        let setApiKey: ((key: string | null) => void) | null = null;

        function GrabSetter() {
            setApiKey = useAuthActions().setApiKey;
            return null;
        }

        await act(async () => {
            create(
                <PolliProvider appKey="pk_test" storage={storage}>
                    <GrabSetter />
                </PolliProvider>,
            );
        });
        act(() => setApiKey?.("sk_live"));

        expect(storage.snapshot()).toMatchObject({
            "polli:pk_test:token": "sk_live",
        });
    });
});
