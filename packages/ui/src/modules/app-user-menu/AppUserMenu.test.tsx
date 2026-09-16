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
    test("renders the branded connect pill when logged out", () => {
        const html = renderToStaticMarkup(
            <PolliProvider appKey="pk_test" storage={memoryStorage()}>
                <AppUserMenu />
            </PolliProvider>,
        );

        expect(html).toContain("Connect with Pollinations");
        expect(html).toContain("mask:url(");
        expect(html).toContain("polli:rounded-full");
        expect(html).not.toContain("polli:border-r-4");
    });
});
