import { act, create } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAuthActions } from "./hooks.js";
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
});
