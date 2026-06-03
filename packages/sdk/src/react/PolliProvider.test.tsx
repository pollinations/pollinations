import { act, create } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
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

    it("prints the local redirect URI used by login", async () => {
        stubWindow("http://127.0.0.1:4178/apps?filter=image#ignored");
        vi.spyOn(console, "warn").mockImplementation(() => {});
        const info = vi.spyOn(console, "info").mockImplementation(() => {});

        await renderProvider("pk_test");

        expect(info).toHaveBeenCalledWith(
            expect.stringContaining("http://127.0.0.1:4178/apps?filter=image"),
        );
        expect(info.mock.calls[0][0]).not.toContain("#ignored");
    });
});
