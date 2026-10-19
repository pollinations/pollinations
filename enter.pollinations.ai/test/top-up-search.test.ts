import { ACCOUNT_RESTRICTED_MESSAGE } from "@shared/auth/ban.ts";
import { defaultParseSearch } from "@tanstack/react-router";
import { expect, test } from "vitest";
import {
    checkoutNotice,
    checkoutReturnSearch,
    validateTopUpSearch,
} from "../frontend/src/lib/top-up-search.ts";

test.each(["stripe_success", "stripe_canceled", "stripe_billing_return"])(
    "preserves %s after the router parses a Stripe return URL",
    (flag) => {
        const search = validateTopUpSearch(
            defaultParseSearch(
                `?${flag}=true&pack=p5&redirect=https%3A%2F%2Fapp.example%2Fchat`,
            ),
        );
        expect(search).toMatchObject({
            [flag]: true,
            pack: "p5",
            redirect: "https://app.example/chat",
        });
    },
);

test.each(["false", "0", "anything", ""])(
    "does not treat %s as a successful or canceled payment",
    (value) => {
        const search = validateTopUpSearch(
            defaultParseSearch(
                `?stripe_success=${value}&stripe_canceled=${value}`,
            ),
        );
        expect(search.stripe_success).toBeUndefined();
        expect(search.stripe_canceled).toBeUndefined();
    },
);

// Hosted checkout's link sends the buyer back with why it didn't open.
test.each([
    ["restricted", ACCOUNT_RESTRICTED_MESSAGE],
    ["failed", "Couldn’t load checkout. Choose an amount to try again."],
])("says why checkout didn't open: %s", (code, notice) => {
    const search = validateTopUpSearch(
        defaultParseSearch(`?pack=p5&checkout_error=${code}`),
    );
    expect(search).toMatchObject({ pack: "p5", checkout_error: code });
    expect(checkoutNotice(search)).toBe(notice);
});

test("ignores an unknown checkout error", () => {
    const search = validateTopUpSearch(
        defaultParseSearch("?checkout_error=%3Cscript%3E"),
    );
    expect(search.checkout_error).toBeUndefined();
    expect(checkoutNotice(search)).toBeUndefined();
});

// The wallet page parses its search with checkoutReturnSearch alone.
test("the wallet reads a cancel on Stripe's page", () => {
    const search = checkoutReturnSearch(
        defaultParseSearch("?pack=p5&stripe_canceled=true"),
    );
    expect(checkoutNotice(search)).toBe(
        "Checkout was cancelled. Choose an amount to try again.",
    );
});

test("a reason to stop wins over a cancel", () => {
    const search = checkoutReturnSearch(
        defaultParseSearch("?stripe_canceled=true&checkout_error=restricted"),
    );
    expect(checkoutNotice(search)).toBe(ACCOUNT_RESTRICTED_MESSAGE);
});

test.each(["", "?pack=p5", "?stripe_success=true&session_id=cs_test_1"])(
    "shows no checkout notice for %j",
    (query) => {
        expect(
            checkoutNotice(checkoutReturnSearch(defaultParseSearch(query))),
        ).toBeUndefined();
    },
);
