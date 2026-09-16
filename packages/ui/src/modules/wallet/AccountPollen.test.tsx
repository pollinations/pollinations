import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AccountPollen } from "./AccountPollen.tsx";

describe("account Pollen", () => {
    it("shows the app budget as an amount or an infinity sign", () => {
        const some = renderToStaticMarkup(
            <AccountPollen source={{ type: "budget", remaining: 3.25 }} />,
        );
        expect(some).toContain("3.25 pollen");
        expect(some).not.toContain("Limit reached");
        const unlimited = renderToStaticMarkup(
            <AccountPollen source={{ type: "budget", remaining: null }} />,
        );
        expect(unlimited).toContain("M12 12c-2-2.67");
        expect(unlimited).toContain(">unlimited<");
        expect(unlimited).toContain("pollen");
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
        for (const remaining of [undefined, NaN, Infinity]) {
            expect(
                renderToStaticMarkup(
                    <AccountPollen source={{ type: "budget", remaining }} />,
                ),
            ).toBe("");
        }
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

    it("keeps placeholders for a wallet that failed to load and nothing while loading", () => {
        expect(
            renderToStaticMarkup(
                <AccountPollen source={{ type: "wallet", balances: null }} />,
            ),
        ).toContain("…");
        expect(
            renderToStaticMarkup(<AccountPollen source={{ type: "wallet" }} />),
        ).toBe("");
    });
});
