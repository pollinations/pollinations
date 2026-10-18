import type { AccountPermission } from "@pollinations/sdk";
import type { PolliProviderProps } from "@pollinations/sdk/react";
import {
    type AppUserMenuProps,
    MENU_LINK_ICONS,
} from "../modules/app-user-menu/AppUserMenu.tsx";

/** Attributes `<polli-connect>` reads; changing one re-renders it. */
export const CONNECT_ATTRIBUTES = [
    "app-key",
    "budget",
    "expiry",
    "models",
    "permissions",
    "enter-url",
    "hide-buy-pollen",
    "menu-side",
    "menu-links",
] as const;

/**
 * Maps the element's attributes to the SDK's sign-in options. The key stays in
 * sessionStorage, as allowed by the Connect User Wallets guide for browser apps.
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

/** Optional presentation settings; these never change the requested access. */
export function connectMenuOptions(
    element: Pick<Element, "getAttribute">,
): Pick<AppUserMenuProps, "showBuyPollen" | "menuSide" | "menuLinks"> {
    const links: unknown = JSON.parse(
        element.getAttribute("menu-links") || "[]",
    );
    if (
        !Array.isArray(links) ||
        links.some(
            (link) =>
                !link ||
                typeof link.label !== "string" ||
                typeof link.href !== "string" ||
                !/^https?:\/\//.test(link.href) ||
                (link.icon !== undefined &&
                    !Object.hasOwn(MENU_LINK_ICONS, link.icon)),
        )
    ) {
        throw new Error(
            "menu-links must contain labels, HTTP(S) hrefs, and supported icons",
        );
    }
    return {
        showBuyPollen: element.getAttribute("hide-buy-pollen") === null,
        menuSide:
            element.getAttribute("menu-side") === "top" ? "top" : "bottom",
        menuLinks: links,
    };
}
