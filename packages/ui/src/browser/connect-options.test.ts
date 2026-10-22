import { describe, expect, test } from "vitest";
import { connectMenuOptions, connectOptions } from "./connect-options.ts";

const element = (attributes: Record<string, string>) => ({
    getAttribute: (name: string) => attributes[name] ?? null,
});

describe("connectMenuOptions", () => {
    test("keeps the default menu and accepts a docs footer configuration", () => {
        expect(connectMenuOptions(element({}))).toEqual({
            showBuyPollen: true,
            menuLinks: [],
        });
        const links = [
            {
                label: "Dashboard",
                href: "https://enter.pollinations.ai",
                icon: "app",
            },
        ];
        expect(
            connectMenuOptions(
                element({
                    "hide-buy-pollen": "",
                    "menu-links": JSON.stringify(links),
                }),
            ),
        ).toEqual({ showBuyPollen: false, menuLinks: links });
    });

    test("ignores malformed menu configuration without blocking sign-in", () => {
        for (const value of [
            "{",
            "{}",
            "[null]",
            '[{"label":"Help","href":"/help"}]',
            '[{"label":"Bad","href":"https://example.com","icon":"unknown"}]',
            '[{"label":"Bad","href":"javascript:alert(1)"}]',
        ]) {
            expect(
                connectMenuOptions(element({ "menu-links": value })),
            ).toEqual({
                showBuyPollen: true,
                menuLinks: [],
            });
        }
    });

    test("preserves valid links when other entries are invalid", () => {
        const valid = { label: "Help", href: "https://example.com/help" };
        expect(
            connectMenuOptions(
                element({
                    "menu-links": JSON.stringify([
                        null,
                        { label: "Bad", href: "javascript:alert(1)" },
                        valid,
                    ]),
                }),
            ).menuLinks,
        ).toEqual([valid]);
    });
});

describe("connectOptions", () => {
    test("maps <polli-connect> attributes to the SDK's sign-in options", () => {
        expect(
            connectOptions(
                element({
                    "app-key": " pk_demo ",
                    budget: "10",
                    expiry: "7",
                    models: "openai, flux ,",
                    permissions: "profile,usage",
                    "enter-url": "https://staging.enter.pollinations.ai",
                }),
            ),
        ).toEqual({
            appKey: "pk_demo",
            budget: 10,
            expiry: 7,
            models: ["openai", "flux"],
            permissions: ["profile", "usage"],
            storage: "sessionStorage",
            enterUrl: "https://staging.enter.pollinations.ai",
        });
    });

    test("leaves unset or invalid values to the SDK defaults", () => {
        expect(
            connectOptions(
                element({ "app-key": "pk_demo", budget: "lots", models: " " }),
            ),
        ).toEqual({
            appKey: "pk_demo",
            budget: undefined,
            expiry: undefined,
            models: undefined,
            permissions: undefined,
            storage: "sessionStorage",
            enterUrl: undefined,
        });
    });
});
