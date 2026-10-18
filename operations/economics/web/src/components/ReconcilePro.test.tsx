import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ReconcileProContext, useAmountDisplay } from "./ReconcilePro";

function Numbers() {
    const { fmtUsd, fmtNumber, fmtRateUsd, fmtMarginPct, fmtUnsignedPct } =
        useAmountDisplay();
    return (
        <span>
            {[
                fmtUsd(1234.56),
                fmtNumber(-1234.56),
                fmtRateUsd(0.125),
                fmtMarginPct(42.67),
                fmtUnsignedPct(99.99),
                fmtUsd(null),
            ].join(" | ")}
        </span>
    );
}

it("uses whole units outside Pro without turning missing amounts into zero or partial coverage into 100%", () => {
    expect(renderToStaticMarkup(<Numbers />)).toBe(
        "<span>$1,235 | −1,235 | &lt;$1 | 43% | &lt;100% | –</span>",
    );
});

it("restores decimals in Pro from the same recorded values", () => {
    expect(
        renderToStaticMarkup(
            <ReconcileProContext.Provider value={true}>
                <Numbers />
            </ReconcileProContext.Provider>,
        ),
    ).toBe("<span>$1,234.56 | −1,234.56 | $0.125 | 42.67% | 99.99% | –</span>");
});
