import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
    type CheckoutConfirmationState,
    CheckoutStatusMessage,
} from "../frontend/src/components/pollen/checkout-status-message.tsx";
import { checkoutReturnSearch } from "../frontend/src/lib/top-up-search.ts";

function render(state: CheckoutConfirmationState, onRetry?: () => void) {
    return renderToStaticMarkup(
        <CheckoutStatusMessage state={state} onRetry={onRetry} />,
    );
}

describe("checkout confirmation", () => {
    it.each([
        [{ status: "checking" }, "Adding your Pollen"],
        [{ status: "credited", pollen: 1000 }, "+1,000 Pollen added"],
        [{ status: "timeout" }, "appear when Stripe confirms the payment"],
    ] as const)("says what %j means for the buyer", (state, text) => {
        expect(render(state)).toContain(text);
    });

    it("says added only once the session is credited", () => {
        for (const status of ["checking", "timeout"] as const)
            expect(render({ status })).not.toContain("Pollen added");
    });

    it("offers a new checkout after an expired one", () => {
        expect(render({ status: "expired" }, () => {})).toContain("Buy again");
        expect(render({ status: "expired" })).not.toContain("<button");
    });
});

describe("checkout return search", () => {
    it("reads the session only from a successful Stripe return", () => {
        expect(
            checkoutReturnSearch({
                stripe_success: "true",
                session_id: "cs_test_a1B2",
            }),
        ).toEqual({ session_id: "cs_test_a1B2" });
        for (const search of [
            { session_id: "cs_test_a1B2" },
            { stripe_success: "true" },
            { stripe_success: "true", session_id: "{CHECKOUT_SESSION_ID}" },
            { stripe_success: "true", session_id: "cs_x/../y" },
        ])
            expect(checkoutReturnSearch(search)).toEqual({});
    });
});
