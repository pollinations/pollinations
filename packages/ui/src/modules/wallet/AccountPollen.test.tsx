import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppUserMenuView } from "../app-user-menu/AppUserMenuView.tsx";
import { AccountPollen, getAccountPollenStatus } from "./AccountPollen.tsx";

describe("account Pollen", () => {
    it.each([
        [10, 5, "any", undefined],
        [0, 5, "any", undefined],
        [0, 0, "any", "no-pollen"],
        [-1, -2, "any", "no-pollen"],
        [0, 5, "paid", "paid-required"],
        [0, 0, "paid", "paid-required"],
        [0.01, 0, "paid", undefined],
        [0, 0, "none", undefined],
    ] as const)("resolves wallet %s/%s with requirement %s", (paid, quest, requirement, expected) => {
        expect(
            getAccountPollenStatus({
                type: "wallet",
                balances: { paid, quest },
                requirement,
            })?.state,
        ).toBe(expected);
    });

    it("does not turn unavailable or invalid data into an empty wallet or limit", () => {
        for (const balances of [
            undefined,
            null,
            { paid: NaN, quest: 0 },
            { paid: 0, quest: Infinity },
        ]) {
            expect(
                getAccountPollenStatus({ type: "wallet", balances }),
            ).toBeUndefined();
        }
        for (const remaining of [undefined, null, NaN, Infinity, 0.01]) {
            expect(
                getAccountPollenStatus({ type: "allowance", remaining }),
            ).toBeUndefined();
        }
    });

    it("distinguishes an exhausted app allowance from wallet funding", () => {
        expect(
            getAccountPollenStatus({ type: "allowance", remaining: 0 }),
        ).toEqual({ state: "limit-reached" });
        expect(
            getAccountPollenStatus({ type: "allowance", remaining: -1 }),
        ).toEqual({ state: "limit-reached" });
        expect(
            getAccountPollenStatus({
                type: "allowance",
                remaining: 0,
                generationEnabled: false,
            }),
        ).toBeUndefined();
    });

    it("replaces both wallet amounts with one actionable badge", () => {
        const normal = renderToStaticMarkup(
            <AccountPollen
                source={{ type: "wallet", balances: { paid: 0, quest: 5 } }}
            />,
        );
        expect(normal).toContain("Paid Pollen:");
        expect(normal).toContain("Quest Pollen:");
        expect(normal).toContain("polli-wallet-text-paid");
        const empty = renderToStaticMarkup(
            <AccountPollen
                source={{ type: "wallet", balances: { paid: 0, quest: 0 } }}
                topUpHref="/top-up"
            />,
        );
        expect(empty).toContain("No Pollen");
        expect(empty).toContain('href="/top-up"');
        expect(empty).not.toContain("Paid Pollen:");
        expect(empty).not.toContain("Quest Pollen:");
    });

    it("preserves the paid icon color in the paid-required badge", () => {
        const markup = renderToStaticMarkup(
            <AccountPollen
                source={{
                    type: "wallet",
                    balances: { paid: 0, quest: 5 },
                    requirement: "paid",
                }}
            />,
        );
        expect(markup).toContain("Paid required");
        expect(markup).toContain("polli-wallet-text-paid");
    });

    it("uses the same badge inside the menu without a nested recovery link", () => {
        const badge = renderToStaticMarkup(
            <AccountPollen source={{ type: "allowance", remaining: 0 }} />,
        );
        const menu = renderToStaticMarkup(
            <AppUserMenuView
                name="Example"
                remaining={0}
                onDisconnect={() => {}}
                editKeyHref="/edit-key?id=example"
                walletHref="/top-up"
            />,
        );
        expect(menu).toContain(badge);
        expect(menu).not.toContain("Paid Pollen:");
        expect(menu).not.toContain("Quest Pollen:");
        expect(menu).not.toContain("fund-account");
        expect(
            renderToStaticMarkup(
                <AccountPollen
                    source={{ type: "allowance", remaining: 0 }}
                    topUpHref="/top-up"
                />,
            ),
        ).not.toContain("/top-up");
    });
});
