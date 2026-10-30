import {
    decodePaymentSignatureHeader,
    encodePaymentRequiredHeader,
} from "@x402/core/http";
import type { PaymentRequired } from "@x402/core/types";
import { BaseError } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { afterEach, expect, test, vi } from "vitest";
import {
    loadPrepaidQuote,
    prepaidAmount,
    prepaidBalance,
    prepaidPaymentHeaders,
    prepaidWalletError,
    submitPrepaidPayment,
    validatePrepaidQuote,
} from "../frontend/src/lib/prepaid-checkout.ts";

// Public, unfunded test signer. No transaction is submitted to a network.
const signer = privateKeyToAccount(`0x${"1".repeat(64)}`);
const url = "https://enter.example/api/x402/keys/2.00";
const quote: PaymentRequired = {
    x402Version: 2,
    resource: {
        url,
        description: "2 prepaid Pollen",
        mimeType: "application/json",
    },
    accepts: [
        {
            scheme: "exact",
            network: "eip155:8453",
            asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
            amount: "2000000",
            payTo: "0x0000000000000000000000000000000000000002",
            maxTimeoutSeconds: 60,
            extra: { name: "USD Coin", version: "2" },
        },
    ],
};

afterEach(() => vi.unstubAllGlobals());

test("shows actionable wallet errors without displaying provider details", () => {
    const rejected = new BaseError("Do not display this signed payload", {
        cause: Object.assign(new Error("private provider details"), {
            code: 4001,
        }),
    });
    expect(prepaidWalletError(rejected)).toContain("You declined");
    expect(prepaidWalletError(rejected)).not.toContain("private");
    expect(prepaidWalletError({ code: "wallet_missing" })).toContain(
        "No browser wallet",
    );
    expect(prepaidWalletError({ code: 4901 })).toContain("Switch to Base");
    expect(
        prepaidWalletError(new Error("private provider details")),
    ).not.toContain("private");
});

test("checks a prepaid balance using only the authorization header", async () => {
    const transport = vi
        .fn()
        .mockResolvedValue(Response.json({ balance: 0.01 }));
    vi.stubGlobal("fetch", transport);
    const balanceUrl = "https://gen.example/account/balance";
    expect(await prepaidBalance(balanceUrl, "sk_prepaid_fixture")).toBe(0.01);
    expect(transport).toHaveBeenCalledWith(balanceUrl, {
        credentials: "omit",
        cache: "no-store",
        headers: { Authorization: "Bearer sk_prepaid_fixture" },
    });
    transport.mockResolvedValueOnce(Response.json({ balance: "0.01" }));
    await expect(
        prepaidBalance(balanceUrl, "sk_prepaid_fixture"),
    ).rejects.toThrow("Invalid balance");
});

test("accepts cent amounts within the prepaid API range", () => {
    expect(prepaidAmount("0.01")).toBe("0.01");
    expect(prepaidAmount("2")).toBe("2.00");
    expect(prepaidAmount("10000")).toBe("10000.00");
    for (const invalid of ["", "0", "-2", "0.001", "10000.01", "1e2", "NaN"])
        expect(() => prepaidAmount(invalid)).toThrow();
});

test("rejects a different amount, token, chain or payment scheme before signing", () => {
    expect(validatePrepaidQuote(quote, "2").accepts).toEqual(quote.accepts);
    for (const change of [
        { amount: "2000001" },
        { network: "eip155:1" },
        { asset: "0x0000000000000000000000000000000000000003" },
        { scheme: "upto" },
        { payTo: "invalid" },
    ])
        expect(() =>
            validatePrepaidQuote(
                { ...quote, accepts: [{ ...quote.accepts[0], ...change }] },
                "2",
            ),
        ).toThrow();
    expect(() =>
        validatePrepaidQuote({ ...quote, x402Version: 1 }, "2"),
    ).toThrow();
});

test("reads the API's x402 challenge without sending account credentials", async () => {
    const transport = vi.fn().mockResolvedValue(
        new Response(null, {
            status: 402,
            headers: { "PAYMENT-REQUIRED": encodePaymentRequiredHeader(quote) },
        }),
    );
    vi.stubGlobal("fetch", transport);
    expect(await loadPrepaidQuote(url, "2")).toEqual(quote);
    expect(transport).toHaveBeenCalledWith(
        url,
        expect.objectContaining({
            method: "POST",
            credentials: "omit",
            cache: "no-store",
        }),
    );
});

test("retries an uncertain purchase with identical signed payment bytes", async () => {
    // Sign with the real x402 SDK and viem; only the HTTP transport is replaced.
    const headers = await prepaidPaymentHeaders(quote, "2", signer);
    const payload = decodePaymentSignatureHeader(headers["PAYMENT-SIGNATURE"]);
    expect(payload.accepted).toMatchObject(quote.accepts[0]);
    expect(payload.payload).toMatchObject({
        authorization: { from: signer.address, value: "2000000" },
    });
    const transport = vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status: 503 }))
        .mockResolvedValueOnce(
            Response.json({ key: "sk_prepaid_fixture", pollen: 2 }),
        );
    vi.stubGlobal("fetch", transport);
    await expect(submitPrepaidPayment(url, headers)).rejects.toThrow(
        "Retry this payment",
    );
    expect(await submitPrepaidPayment(url, headers)).toEqual({
        key: "sk_prepaid_fixture",
        pollen: 2,
    });
    expect(transport.mock.calls[0]).toEqual(transport.mock.calls[1]);
    expect(transport.mock.calls[1][1].headers["PAYMENT-SIGNATURE"]).toBe(
        headers["PAYMENT-SIGNATURE"],
    );
});
