import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AccountPollen } from "./AccountPollen.tsx";
import { WalletBalanceCard } from "./wallet-display.tsx";

describe("account Pollen", () => {
    it("shows the app budget as an amount or an Unlimited badge", () => {
        const some = renderToStaticMarkup(
            <AccountPollen source={{ type: "budget", remaining: 3.25 }} />,
        );
        expect(some).toContain("3.25 pollen");
        expect(some).not.toContain("Limit reached");
        const unlimited = renderToStaticMarkup(
            <AccountPollen source={{ type: "budget", remaining: null }} />,
        );
        expect(unlimited).toContain("Unlimited");
        expect(unlimited).toContain("polli:bg-intent-info-bg-light");
        expect(unlimited).not.toContain("pollen");
    });

    it("turns an exhausted app budget into a badge without a link", () => {
        for (const remaining of [0, -1]) {
            const badge = renderToStaticMarkup(
                <AccountPollen
                    source={{ type: "budget", remaining }}
                    topUpHref="/top-up"
                />,
            );
            expect(badge).toContain("Limit reached");
            expect(badge).toContain("polli:bg-intent-danger-bg-light");
            expect(badge).not.toContain("<a ");
        }
    });

    it("renders nothing for a budget that is unknown or cannot generate", () => {
        expect(
            renderToStaticMarkup(
                <AccountPollen
                    source={{ type: "budget", remaining: undefined }}
                />,
            ),
        ).toBe("");
        expect(
            renderToStaticMarkup(
                <AccountPollen
                    source={{
                        type: "budget",
                        remaining: 0,
                        generationEnabled: false,
                    }}
                />,
            ),
        ).toBe("");
    });

    it("keeps the amounts while any Pollen is left", () => {
        const mixed = renderToStaticMarkup(
            <AccountPollen
                source={{ type: "wallet", balances: { paid: 0, quest: 5 } }}
                topUpHref="/top-up"
            />,
        );
        expect(mixed).toContain("Quest Pollen:");
        expect(mixed).toContain("Paid Pollen:");
        expect(mixed).not.toContain("No Pollen");
        expect(mixed).not.toContain("/top-up");
        expect(mixed.indexOf("Quest")).toBeLessThan(mixed.indexOf("Paid"));
    });

    it("turns an empty wallet into a badge, linked only when a link is given", () => {
        const linked = renderToStaticMarkup(
            <AccountPollen
                source={{ type: "wallet", balances: { paid: 0, quest: 0 } }}
                topUpHref="/top-up"
            />,
        );
        expect(linked).toContain("No Pollen");
        expect(linked).toContain('href="/top-up"');
        expect(linked).not.toContain("Quest Pollen:");
        const menu = renderToStaticMarkup(
            <AccountPollen
                source={{ type: "wallet", balances: { paid: 0, quest: 0 } }}
            />,
        );
        expect(menu).toContain("No Pollen");
        expect(menu).not.toContain("<a ");
    });

    it("keeps the top-up return destination in the same tab", () => {
        const href = "/top-up?redirect=%2Fauthorize%3Fclient_id%3Dexample";
        const markup = renderToStaticMarkup(
            <AccountPollen
                source={{ type: "wallet", balances: { paid: 0, quest: 0 } }}
                topUpHref={href}
            />,
        );
        expect(markup).toContain(`href="${href}"`);
        expect(markup).not.toContain('target="_blank"');
    });

    it("renders nothing while the wallet is unavailable", () => {
        expect(
            renderToStaticMarkup(<AccountPollen source={{ type: "wallet" }} />),
        ).toBe("");
    });
});

describe("wallet card colors", () => {
    it("keeps the balance palette as the default", () => {
        for (const kind of ["paid", "tier"] as const) {
            const html = renderToStaticMarkup(
                <WalletBalanceCard kind={kind} label="Balance" value={5} />,
            );
            expect(html).toContain(`polli-wallet-panel-${kind}`);
            expect(html).toContain(`polli-wallet-text-${kind}`);
        }
    });

    it("uses neutral colors for totals without changing the card layout", () => {
        const html = renderToStaticMarkup(
            <WalletBalanceCard
                tone="neutral"
                kind="tier"
                label="Pollen"
                value={27.5}
            />,
        );
        expect(html).not.toContain("polli-wallet-panel-tier");
        expect(html).not.toContain("polli-wallet-text-tier");
        expect(html).toContain("polli:bg-surface-opaque");
        expect(html).toContain("polli:rounded-xl polli:p-4");
        expect(html).toContain("polli-wallet-balance-value");
        expect(html).toContain("27.5");
    });
});
