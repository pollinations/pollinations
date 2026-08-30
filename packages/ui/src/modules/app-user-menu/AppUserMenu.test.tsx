import { PolliProvider, type StorageAdapter } from "@pollinations/sdk/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { AppUserMenu } from "./AppUserMenu.tsx";

const memoryStorage = (): StorageAdapter => {
    const values = new Map<string, string>();

    return {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
        removeItem: (key) => values.delete(key),
    };
};

describe("AppUserMenu", () => {
    test("applies the action treatment to the logged-out trigger", () => {
        const html = renderToStaticMarkup(
            <PolliProvider appKey="pk_test" storage={memoryStorage()}>
                <AppUserMenu
                    dashboardHref="https://enter.pollinations.ai"
                    triggerVariant="action"
                />
            </PolliProvider>,
        );

        expect(html).toContain("polli:min-h-14");
        expect(html).toContain("polli:rounded-xl");
        expect(html).toContain("polli:border-r-4");
        expect(html).toContain('d="M15 12H3"');
        expect(html).not.toContain('d="M7 11V7a5 5 0 0 1 10 0v4"');
    });
});
