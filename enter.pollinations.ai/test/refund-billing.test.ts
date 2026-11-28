import { createExecutionContext, env } from "cloudflare:test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { RefundBilling } from "@/services/refund-billing.ts";

const invoice = {
    id: "in_purchase",
    number: "TEST-0001",
    customer: "cus_current",
    status: "paid",
    amount_paid: 1000,
};
const send = vi.fn().mockResolvedValue({ messageId: "test" });
const submit = (number = invoice.number, accountId = "buyer") =>
    new RefundBilling(createExecutionContext(), {
        ...env,
        STRIPE_SECRET_KEY: "test-only",
        EMAIL: { send },
    }).submitWithdrawal(accountId, number);

beforeEach(async () => {
    await env.DB.prepare(
        "INSERT INTO user (id, name, email, stripe_customer_id) VALUES (?, ?, ?, ?)",
    )
        .bind("buyer", "Account holder", "buyer@example.com", "cus_current")
        .run();
});
afterEach(() => {
    vi.unstubAllGlobals();
    send.mockClear();
});

function stripeResponses(handler: (url: URL) => object[]) {
    const fetchStripe = vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(input instanceof Request ? input.url : input);
        expect(url.host).toBe("api.stripe.com");
        return Response.json({
            object: url.pathname.endsWith("/search") ? "search_result" : "list",
            data: handler(url),
            has_more: false,
        });
    });
    vi.stubGlobal("fetch", fetchStripe);
    return fetchStripe;
}

test("a fresh paid invoice sends billing and the account email one dated declaration", async () => {
    stripeResponses((url) => {
        expect(url.pathname).toBe("/v1/invoices");
        expect(url.searchParams.get("customer")).toBe("cus_current");
        return [invoice];
    });
    expect(await submit()).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
            to: "billing@pollinations.ai",
            cc: ["buyer@example.com"],
            text: expect.stringMatching(
                /I withdraw from the credit top-up purchase[\s\S]*TEST-0001[\s\S]*buyer[\s\S]*Received \(UTC\): \d{4}-\d\d-\d\dT\d\d:\d\d:/,
            ),
        }),
    );
});

test("an older checkout must match both its invoice and its recorded Pollinations user", async () => {
    let checkout = { invoice: "in_other", metadata: { userId: "buyer" } };
    stripeResponses((url) => {
        if (url.pathname === "/v1/invoices") return [];
        if (url.pathname === "/v1/invoices/search") {
            expect(url.searchParams.get("query")).toBe('number:"TEST-0001"');
            return [{ ...invoice, customer: "cus_old" }];
        }
        expect(url.pathname).toBe("/v1/checkout/sessions");
        expect(url.searchParams.get("customer")).toBe("cus_old");
        return [checkout];
    });
    expect(await submit()).toBe(false);
    checkout = { invoice: invoice.id, metadata: { userId: "other-buyer" } };
    expect(await submit()).toBe(false);
    expect(send).not.toHaveBeenCalled();
    checkout.metadata.userId = "buyer";
    expect(await submit()).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
});

test("unmatched details and unpaid invoices send nothing, and mail failure is reported", async () => {
    let candidate = { ...invoice, status: "open" };
    const fetchStripe = stripeResponses(() => [candidate]);
    expect(await submit(invoice.number, "absent")).toBe(false);
    expect(fetchStripe).not.toHaveBeenCalled();
    expect(await submit()).toBe(false);
    candidate = invoice;
    expect(await submit("OTHER-9999")).toBe(false);
    expect(send).not.toHaveBeenCalled();
    send.mockRejectedValueOnce(new Error("mail unavailable"));
    await expect(submit()).rejects.toThrow("mail unavailable");
});
