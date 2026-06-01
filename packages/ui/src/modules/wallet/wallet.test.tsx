import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PaidChip, TierChip } from "./chips.tsx";
import { formatPollen } from "./format-pollen.ts";
import { WalletBalanceCard, WalletDot } from "./wallet-display.tsx";

describe("wallet", () => {
    it("formats pollen values with the compact display budget", () => {
        expect(formatPollen(1234.5678)).toBe("1234.5");
        expect(formatPollen(123456)).toBe("123K");
        expect(formatPollen(0.00001)).toBe("0");
    });

    it("renders paid and tier chips with wallet classes", () => {
        const html = renderToStaticMarkup(
            <>
                <PaidChip>paid</PaidChip>
                <TierChip>tier</TierChip>
            </>,
        );

        expect(html).toContain("polli-wallet-chip-paid");
        expect(html).toContain("polli-wallet-chip-tier");
    });

    it("renders wallet balance display classes without sdk hooks", () => {
        const html = renderToStaticMarkup(
            <>
                <WalletBalanceCard kind="paid" label="Paid" value="10" />
                <WalletDot kind="tier" />
            </>,
        );

        expect(html).toContain("polli-wallet-panel-paid");
        expect(html).toContain("polli-wallet-dot-tier");
    });
});
