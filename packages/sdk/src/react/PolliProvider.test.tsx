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

    it("recovers from browser navigation failure and preserves PKCE on retry", async () => {
        const win = stubWindow("https://app.example/?view=connect");
        const storage = memoryStorage();
        const navigate = vi.fn().mockImplementationOnce(() => {
            throw new Error("Browser navigation failed");
        });
        Object.defineProperty(win.location, "href", {
            get: () => "https://app.example/?view=connect",
            set: navigate,
        });
        let auth: ReturnType<typeof useAuth> | undefined;
        function Capture() {
            auth = useAuth();
            return null;
        }
        await act(async () => {
            create(
                <PolliProvider appKey="pk_test" storage={storage}>
                    <Capture />
                </PolliProvider>,
            );
        });
        await act(async () => {
            auth?.login();
            await vi.waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
        });
        expect(auth?.error?.message).toBe("Browser navigation failed");
        expect(storage.snapshot()).toEqual({});
        await act(async () => {
            auth?.login({
                permissions: ["profile"],
                budget: 5,
                expiry: 7,
                models: ["example-model"],
            });
            await vi.waitFor(() => expect(navigate).toHaveBeenCalledTimes(2));
        });
        const request = new URL(navigate.mock.calls[1][0]);
        expect(request.pathname).toBe("/authorize");
        expect(request.searchParams.get("scope")).toBe("profile");
        expect(request.searchParams.get("budget")).toBe("5");
        expect(request.searchParams.get("expiry")).toBe("7");
        expect(request.searchParams.get("models")).toBe("example-model");
        expect(request.searchParams.get("state")).toBe(
            storage.getItem("polli:pk_test:oauth_state"),
        );
        const digest = await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(
                storage.getItem("polli:pk_test:oauth_verifier") ?? "",
            ),
        );
        expect(request.searchParams.get("code_challenge")).toBe(
            Buffer.from(digest).toString("base64url"),
        );
        expect(request.searchParams.get("redirect_uri")).toBe(
            "https://app.example/",
        );
        expect((win.location as { href: string }).href).toBe(
            "https://app.example/?view=connect",
        );
        expect(auth?.error).toBeNull();
    });

    it("reports a storage write failure and allows a subsequent login", async () => {
        const win = stubWindow("https://app.example/");
        const storage = memoryStorage();
        const write = vi
            .spyOn(storage, "setItem")
            .mockImplementationOnce(() => {
                throw new Error("Storage full");
            });
        let auth: ReturnType<typeof useAuth> | undefined;
        let login: ReturnType<typeof useAuthActions>["login"] | undefined;
        function Capture() {
            auth = useAuth();
            login = useAuthActions().login;
            return null;
        }
        await act(async () => {
            create(
                <PolliProvider appKey="pk_test" storage={storage}>
                    <Capture />
                </PolliProvider>,
            );
        });
        await act(async () => {
            login?.();
        });
        expect(auth?.error?.message).toBe("Storage full");
        expect(storage.snapshot()).toEqual({});
        expect((win.location as { href: string }).href).toBe(
            "https://app.example/",
        );
        write.mockRestore();
        await act(async () => {
            login?.();
            await vi.waitFor(() =>
                expect(
                    new URL((win.location as { href: string }).href).pathname,
                ).toBe("/authorize"),
            );
        });
        expect(auth?.error).toBeNull();
    });

    it("exposes blocked browser storage without crashing the provider", async () => {
        const win = stubWindow("https://app.example/");
        Object.defineProperty(win, "localStorage", {
            get() {
                throw new Error("Storage unavailable");
            },
        });
        let auth: ReturnType<typeof useAuth> | undefined;
        let login: ReturnType<typeof useAuthActions>["login"] | undefined;
        function Capture() {
            auth = useAuth();
            login = useAuthActions().login;
            return null;
        }
        await act(async () => {
            create(
                <PolliProvider appKey="pk_test">
                    <Capture />
                </PolliProvider>,
            );
        });
        expect(auth?.error?.message).toBe("Storage unavailable");
        expect(auth?.isHydrated).toBe(true);
        await act(async () => {
            login?.();
        });
        expect(auth?.error?.message).toBe("Storage unavailable");
    });

    it("disconnects in memory even when browser storage cannot be cleared", async () => {
        stubWindow("https://app.example/");
        const storage = memoryStorage({ "polli:pk_test:token": "sk_stored" });
        const auth: { current: ReturnType<typeof useAuth> | null } = {
            current: null,
        };
        function Probe() {
            auth.current = useAuth();
            return null;
        }
        let renderer: ReturnType<typeof create>;
        await act(async () => {
            renderer = create(
                <PolliProvider appKey="pk_test" storage={storage}>
                    <Probe />
                </PolliProvider>,
            );
        });
        expect(auth.current?.isLoggedIn).toBe(true);
        const remove = vi
            .spyOn(storage, "removeItem")
            .mockImplementation(() => {
                throw new Error("Storage unavailable");
            });
        await act(async () => {
            auth.current?.logout();
        });
        expect(auth.current?.isLoggedIn).toBe(false);
        expect(auth.current?.apiKey).toBeNull();
        expect(auth.current?.isHydrated).toBe(true);
        expect(auth.current?.error?.message).toBe("Storage unavailable");
        expect(storage.getItem("polli:pk_test:token")).toBe("sk_stored");
        remove.mockRestore();
        await act(async () => {
            auth.current?.logout();
        });
        expect(storage.getItem("polli:pk_test:token")).toBeNull();
        expect(auth.current?.error).toBeNull();
        await act(async () => {
            renderer.unmount();
        });
    });

    it("ignores repeated login calls while a redirect is pending", async () => {
        const win = stubWindow("https://app.example/");
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
            await vi.waitFor(() =>
                expect(
                    new URL((win.location as { href: string }).href).pathname,
                ).toBe("/authorize"),
            );
        });
    });

    it.each([
        false,
        true,
    ])("exchanges the callback code once and retains the key (storage full: %s)", async (storageFull) => {
        const win = stubWindow(
            "https://app.example/?code=single-use&state=expected",
        );
        const storage = memoryStorage({
            "polli:pk_test:oauth_state": "expected",
            "polli:pk_test:oauth_verifier": "v".repeat(64),
            "polli:pk_test:oauth_return_path": "/?view=models#/details",
        });
        if (storageFull) {
            vi.spyOn(storage, "setItem").mockImplementation(() => {
                throw new Error("Storage full");
            });
        }
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
        expect(storage.snapshot()).toEqual(
            storageFull ? {} : { "polli:pk_test:token": "sk_delegated" },
        );
        expect(
            (win.history as { replaceState: ReturnType<typeof vi.fn> })
                .replaceState,
        ).toHaveBeenCalledWith({}, "", "/?view=models#/details");
        expect(auth.current?.apiKey).toBe("sk_delegated");
        expect(auth.current?.isLoggedIn).toBe(true);
        expect(auth.current?.isHydrated).toBe(true);
        expect(auth.current?.error?.message ?? null).toBe(
            storageFull ? "Storage full" : null,
        );
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

    it.each([
        null,
        "sk_stored",
    ])("restores the saved key (%s) without a network request", async (savedKey) => {
        stubWindow("https://app.example/");
        const storage = memoryStorage(
            savedKey ? { "polli:pk_test:token": savedKey } : {},
        );
        const fetchMock = vi.fn().mockRejectedValue(new TypeError("Offline"));
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
                    <PolliProvider appKey="pk_test" storage={storage}>
                        <Probe />
                    </PolliProvider>
                </StrictMode>,
            );
        });
        expect(auth.current?.isHydrated).toBe(true);
        expect(auth.current?.apiKey).toBe(savedKey);
        expect(auth.current?.isLoggedIn).toBe(!!savedKey);
        expect(auth.current?.error).toBeNull();
        expect(storage.getItem("polli:pk_test:token")).toBe(savedKey);
        expect(fetchMock).not.toHaveBeenCalled();
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
