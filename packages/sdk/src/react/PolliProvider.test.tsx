import { act, create } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthActionsValue } from "./contexts.js";
import { useAuthActions } from "./hooks.js";
import { PolliProvider } from "./PolliProvider.js";
import type { StorageAdapter } from "./storage.js";

function memoryStorage(initial: Record<string, string> = {}): StorageAdapter & {
    snapshot: () => Record<string, string>;
} {
    const values = new Map(Object.entries(initial));
    return {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
        removeItem: (key) => values.delete(key),
        snapshot: () => Object.fromEntries(values),
    };
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

async function renderProvider(appKey: string, storage = memoryStorage()) {
    let actions: AuthActionsValue | null = null;
    function GrabActions() {
        actions = useAuthActions();
        return null;
    }
    await act(async () => {
        create(
            <PolliProvider appKey={appKey} storage={storage}>
                <GrabActions />
            </PolliProvider>,
        );
    });
    return { storage, getActions: () => actions };
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

        await renderProvider("sk_secret_test");

        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining("publishable pk_ App Key"),
        );
        expect(warn.mock.calls[0][0]).not.toContain("sk_secret_test");
    });

    it("persists the key to the provided storage", async () => {
        stubWindow("https://app.example/");
        const { storage, getActions } = await renderProvider("pk_test");

        act(() => getActions()?.setApiKey("sk_live"));

        expect(storage.snapshot()["polli:pk_test:token"]).toBe("sk_live");
    });

    it("starts authorization code flow with PKCE", async () => {
        const win = stubWindow("https://app.example/callback?keep=1");
        const { storage, getActions } = await renderProvider("pk_test");

        await act(async () => {
            await getActions()?.login({ permissions: ["profile"] });
        });

        const authorizationUrl = new URL(
            (win.location as { href: string }).href,
        );
        expect(authorizationUrl.searchParams.get("response_type")).toBe("code");
        expect(authorizationUrl.searchParams.get("client_id")).toBe("pk_test");
        expect(authorizationUrl.searchParams.get("scope")).toBe("profile");
        expect(authorizationUrl.searchParams.get("code_challenge_method")).toBe(
            "S256",
        );
        expect(authorizationUrl.searchParams.get("code_challenge")).toMatch(
            /^[A-Za-z0-9_-]{43}$/,
        );

        const pending = JSON.parse(
            storage.snapshot()["polli:pk_test:oauth_pending"],
        );
        expect(pending.codeVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(pending.redirectUri).toBe("https://app.example/callback?keep=1");
        expect(authorizationUrl.searchParams.get("state")).toBe(pending.state);
    });

    it("exchanges the callback code and stores the delegated key", async () => {
        const win = stubWindow(
            "https://app.example/callback?keep=1&code=oauth-code&state=state",
        );
        const storage = memoryStorage({
            "polli:pk_test:oauth_pending": JSON.stringify({
                state: "state",
                codeVerifier: "verifier",
                redirectUri: "https://app.example/callback?keep=1",
            }),
        });
        const fetchMock = vi.fn(
            async (_input: RequestInfo | URL, _init?: RequestInit) =>
                Response.json({ access_token: "sk_delegated" }),
        );
        vi.stubGlobal("fetch", fetchMock);

        await renderProvider("pk_test", storage);

        await vi.waitFor(() =>
            expect(storage.snapshot()["polli:pk_test:token"]).toBe(
                "sk_delegated",
            ),
        );
        expect(
            storage.snapshot()["polli:pk_test:oauth_pending"],
        ).toBeUndefined();
        expect(fetchMock).toHaveBeenCalledWith(
            "https://enter.pollinations.ai/api/oauth/token",
            expect.objectContaining({ method: "POST" }),
        );
        const request = fetchMock.mock.calls[0]?.[1];
        if (!request) throw new Error("Expected token exchange request");
        expect(String(request.body)).toContain("code=oauth-code");
        expect(String(request.body)).toContain("code_verifier=verifier");
        expect(
            (win.history as { replaceState: ReturnType<typeof vi.fn> })
                .replaceState,
        ).toHaveBeenCalledWith({}, "", "/callback?keep=1");
    });

    it("disconnects by revoking the delegated key", async () => {
        stubWindow("https://app.example/");
        const storage = memoryStorage({
            "polli:pk_test:token": "sk_delegated",
        });
        const fetchMock = vi.fn(
            async () => new Response(null, { status: 200 }),
        );
        vi.stubGlobal("fetch", fetchMock);
        const { getActions } = await renderProvider("pk_test", storage);

        await vi.waitFor(() =>
            expect(getActions()?.disconnect).toBeTypeOf("function"),
        );
        await act(async () => {
            await getActions()?.disconnect();
        });

        expect(fetchMock).toHaveBeenCalledWith(
            "https://enter.pollinations.ai/api/oauth/revoke",
            expect.objectContaining({ method: "POST" }),
        );
        expect(storage.snapshot()["polli:pk_test:token"]).toBeUndefined();
    });
});
