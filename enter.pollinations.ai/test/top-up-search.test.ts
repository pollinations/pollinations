import { defaultParseSearch } from "@tanstack/react-router";
import { expect, test } from "vitest";
import { validateTopUpSearch } from "../frontend/src/lib/top-up-search.ts";

test.each([
    "stripe_success",
    "stripe_canceled",
    "stripe_billing_return",
])("preserves %s after the router parses a Stripe return URL", (flag) => {
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
});

test.each([
    "false",
    "0",
    "anything",
    "",
])("does not treat %s as a successful or canceled payment", (value) => {
    const search = validateTopUpSearch(
        defaultParseSearch(`?stripe_success=${value}&stripe_canceled=${value}`),
    );
    expect(search.stripe_success).toBeUndefined();
    expect(search.stripe_canceled).toBeUndefined();
});
