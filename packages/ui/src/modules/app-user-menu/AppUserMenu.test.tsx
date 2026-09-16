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
                <AppUserMenu triggerVariant="action" />
            </PolliProvider>,
        );

        expect(html).toContain("polli:min-h-14");
        expect(html).toContain("polli:rounded-xl");
        expect(html).toContain("polli:border-r-4");
        expect(html).toContain("polli:border-theme-text-strong/20");
        expect(html).not.toContain("polli:border-brand-dark/20");
        expect(html).toContain("Connect with Pollinations");
        expect(html).toContain("mask:url(");
        expect(html).not.toContain('d="M15 12H3"');
    });
});
