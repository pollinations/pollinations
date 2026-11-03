import { defaultParseSearch } from "@tanstack/react-router";
import { expect, test, vi } from "vitest";
import { preferredReturnUrl } from "../frontend/src/lib/return-to-app.tsx";
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
test("says when checkout didn't open", () => {
    const search = validateTopUpSearch(
        defaultParseSearch("?pack=p5&checkout_error=failed"),
    );
    expect(search).toMatchObject({ pack: "p5", checkout_error: "failed" });
    expect(checkoutNotice(search)).toBe(
        "Couldn’t load checkout. Choose an amount to try again.",
    );
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

test.each(["", "?pack=p5", "?stripe_success=true&session_id=cs_test_1"])(
    "shows no checkout notice for %j",
    (query) => {
        expect(
            checkoutNotice(checkoutReturnSearch(defaultParseSearch(query))),
        ).toBeUndefined();
    },
);

test("preserves an explicit app chat URL when the browser only sends an origin referrer", () => {
    // /top-up replaces redirect only for a non-null result; an origin-only
    // referrer must not erase the Back link's explicit path, query or fragment.
    vi.stubGlobal("document", { referrer: "https://app.example/" });
    vi.stubGlobal("window", {
        location: { origin: "https://enter.pollinations.ai" },
    });
    try {
        expect(
            preferredReturnUrl(
                "https://app.example/chat/123?model=openai#latest",
            ),
        ).toBeNull();
    } finally {
        vi.unstubAllGlobals();
    }
});

test.each(["https://github.com/", "https://accounts.google.com/"])(
    "never takes the sign-in page %s for the app",
    (referrer) => {
        // Back from signing in, a link without an app has no Back link.
        vi.stubGlobal("document", { referrer });
        vi.stubGlobal("window", {
            location: { origin: "https://enter.pollinations.ai" },
        });
        try {
            expect(preferredReturnUrl(undefined)).toBeNull();
        } finally {
            vi.unstubAllGlobals();
        }
    },
);
