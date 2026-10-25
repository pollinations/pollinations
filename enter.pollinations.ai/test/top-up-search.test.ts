import { defaultParseSearch } from "@tanstack/react-router";
import { expect, test, vi } from "vitest";
import { preferredReturnUrl } from "../frontend/src/lib/return-to-app.tsx";
import { validateTopUpSearch } from "../frontend/src/lib/top-up-search.ts";

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
