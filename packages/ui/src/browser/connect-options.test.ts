import { describe, expect, test } from "vitest";
import { connectOptions } from "./connect-options.ts";

const element = (attributes: Record<string, string>) => ({
    getAttribute: (name: string) => attributes[name] ?? null,
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
