import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AccountPollen } from "./AccountPollen.tsx";

const EMPTY = "polli:text-intent-danger-text";

describe("account Pollen", () => {
    it("shows the app budget as an amount, an infinity sign, or a red zero", () => {
        const some = renderToStaticMarkup(
            <AccountPollen source={{ type: "budget", remaining: 3.25 }} />,
        );
        expect(some).toContain("3.25");
        expect(some).not.toContain("pollen<");
        expect(some).not.toContain(EMPTY);
        expect(
            renderToStaticMarkup(
                <AccountPollen
                    source={{ type: "budget", remaining: 3.25, withUnit: true }}
                />,
            ),
        ).toContain("3.25 pollen");
        expect(
            renderToStaticMarkup(
                <AccountPollen
                    source={{ type: "budget", remaining: null, withUnit: true }}
                />,
            ),
        ).toContain("pollen");
        const unlimited = renderToStaticMarkup(
            <AccountPollen source={{ type: "budget", remaining: null }} />,
        );
        expect(unlimited).toContain("M12 12c-2-2.67");
        expect(unlimited).toContain('aria-label="Unlimited app budget"');
        expect(unlimited).not.toContain(EMPTY);
        for (const remaining of [0, -1]) {
            const zero = renderToStaticMarkup(
                <AccountPollen source={{ type: "budget", remaining }} />,
            );
            expect(zero).toContain(EMPTY);
            expect(zero).toContain(">0<");
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

    it("reds out only the wallet amounts that are empty", () => {
        const mixed = renderToStaticMarkup(
            <AccountPollen
                source={{ type: "wallet", balances: { paid: 0, quest: 5 } }}
                topUpHref="/top-up"
            />,
        );
        expect(mixed).toContain("Paid Pollen:");
        expect(mixed).toContain("Quest Pollen:");
        expect(mixed.split(EMPTY).length - 1).toBe(1);
        expect(mixed).not.toContain("/top-up");
        expect(
            renderToStaticMarkup(
                <AccountPollen
                    source={{
                        type: "wallet",
                        balances: { paid: 10, quest: 5 },
                    }}
                />,
            ),
        ).not.toContain(EMPTY);
    });

    it("adds the top-up link only when the whole wallet is empty and a link is given", () => {
        const empty = renderToStaticMarkup(
            <AccountPollen
                source={{ type: "wallet", balances: { paid: 0, quest: 0 } }}
                topUpHref="/top-up"
            />,
        );
        expect(empty.split(EMPTY).length - 1).toBe(2);
        expect(empty).toContain('href="/top-up"');
        expect(empty).toContain("Top up");
        const menu = renderToStaticMarkup(
            <AccountPollen
                source={{ type: "wallet", balances: { paid: 0, quest: 0 } }}
            />,
        );
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
