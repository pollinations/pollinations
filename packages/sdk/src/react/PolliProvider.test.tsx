import { useEffect } from "react";
import { act, create } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PolliProvider, useAuthActions } from "./index.js";
import type { StorageAdapter } from "./storage.js";

function memoryStorage(): StorageAdapter {
    const values = new Map<string, string>();
    return {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
        removeItem: (key) => values.delete(key),
    };
}

function stubWindow(href: string) {
    const url = new URL(href);
    vi.stubGlobal("window", {
        location: {
            href,
            hash: url.hash,
            pathname: url.pathname,
            search: url.search,
        },
        history: {
            replaceState: vi.fn(),
        },
    });
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

function LoginOnMount() {
    const { login } = useAuthActions();

    useEffect(() => {
        login();
    }, [login]);

    return null;
}

async function renderLoginProvider(appKey: string) {
    await act(async () => {
        create(
            <PolliProvider appKey={appKey} storage={memoryStorage()}>
                <LoginOnMount />
            </PolliProvider>,
        );
    });
}

describe("PolliProvider setup guidance", () => {
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

    it("omits client_id when appKey is empty", async () => {
        stubWindow("http://127.0.0.1:4178/");
        vi.spyOn(console, "warn").mockImplementation(() => {});
        vi.spyOn(console, "info").mockImplementation(() => {});
        vi.stubGlobal("crypto", { randomUUID: () => "state-test" });

        await renderLoginProvider("");

        const authorizeUrl = new URL(window.location.href);
        expect(authorizeUrl.origin).toBe("https://enter.pollinations.ai");
        expect(authorizeUrl.pathname).toBe("/authorize");
        expect(authorizeUrl.searchParams.get("redirect_uri")).toBe(
            "http://127.0.0.1:4178/",
        );
        expect(authorizeUrl.searchParams.has("client_id")).toBe(false);
    });
});
