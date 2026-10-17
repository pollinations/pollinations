import type { AccountPermission } from "@pollinations/sdk";
import type { PolliProviderProps } from "@pollinations/sdk/react";

/** Attributes `<polli-connect>` reads; changing one re-renders it. */
export const CONNECT_ATTRIBUTES = [
    "app-key",
    "budget",
    "expiry",
    "models",
    "permissions",
    "enter-url",
] as const;

/**
 * Maps the element's attributes to the SDK's sign-in options. The key stays in
 * sessionStorage, as the Connect User Wallets guide requires for browser apps.
 */
export function connectOptions(
    element: Pick<Element, "getAttribute">,
): Omit<PolliProviderProps, "children"> {
    const text = (name: string) => element.getAttribute(name)?.trim() || "";
    const number = (name: string) => {
        const value = Number.parseFloat(text(name));
        return Number.isFinite(value) ? value : undefined;
    };
    const list = (name: string) => {
        const items = text(name)
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);
        return items.length > 0 ? items : undefined;
    };
    return {
        appKey: text("app-key"),
        budget: number("budget"),
        expiry: number("expiry"),
        models: list("models"),
        permissions: list("permissions") as AccountPermission[] | undefined,
        storage: "sessionStorage",
        enterUrl: text("enter-url") || undefined,
    };
}
