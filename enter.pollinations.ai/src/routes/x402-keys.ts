import { isUserBanned } from "@shared/auth/ban.ts";
import { user as userTable } from "@shared/db/better-auth.ts";
import { POLLEN_PACKS } from "@shared/pollen-packs.ts";
import { weftPaymentMiddlewareHono } from "@weftlabs/sdk/facilitator/middleware";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono, type MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute } from "hono-openapi";
import type { Env } from "../env.ts";
import {
    creditPurchase,
    getPurchase,
    isBuyer,
    type Purchase,
    paymentId,
    paymentIdForPayload,
    preparePurchase,
    purchaseAmountUsd,
    storedKey,
} from "../services/x402-key-purchases.ts";

function paymentSignature(c: {
    req: { header: (name: string) => string | undefined };
}): string | undefined {
    return c.req.header("payment-signature") ?? c.req.header("x-payment");
}

export const x402KeysRoutes = new Hono<Env>()
    .get(
        "/",
        describeRoute({
            tags: ["👤 Account"],
            summary: "Choose an x402 prepaid API key amount",
            description:
                "Buy a new secret API key without a Pollinations login. GET or POST to /api/x402/keys/0.50 for 0.50 Pollen, or use one of the existing pack URLs below. Choose any amount from $0.01 to $10,000 in cents.",
        }),
        (c) => {
            c.header("Cache-Control", "public, max-age=300");
            return c.json({
                packs: POLLEN_PACKS.map((pack) => ({
                    packKey: pack.packKey,
                    priceUsd: pack.amountUsd,
                    pollen: pack.amountUsd,
                    url: new URL(
                        `/api/x402/keys/${pack.packKey}`,
                        c.req.url,
                    ).toString(),
                    method: "POST",
                })),
            });
        },
    )
    .on(
        ["GET", "POST"],
        "/:packKey",
        describeRoute({
            tags: ["👤 Account"],
            summary: "Buy a prepaid API key with x402",
            description:
                'GET or POST to /api/x402/keys/{amountUsd} to pay that amount in USDC and receive the same amount of Pollen in a new secret API key. Existing pack keys also work. Returns 402 with exact payment terms; retry with PAYMENT-SIGNATURE. Each payment (one signed EIP-3009 transfer) returns its key once; other requests with it get 409. To get the key again, repeat the request with X402-BUYER-ISSUED-AT (unix seconds, from 120 s old to 30 s ahead) and X402-BUYER-SIGNATURE, the paying wallet\'s personal_sign of these lines joined by newlines: "Recover Pollinations x402 key", "Origin: {origin}", "Network: {network}", "Asset: {checksummed asset}", "Payer: {checksummed payer}", "Nonce: {lowercase authorization nonce}", "Issued at: {X402-BUYER-ISSUED-AT}".',
            responses: {
                200: { description: "Prepaid API key" },
                402: { description: "x402 payment required" },
                503: { description: "Purchases are not configured" },
            },
        }),
        async (c) => {
            c.header("Cache-Control", "private, no-store");
            const purchaseKey = c.req.param("packKey");
            const amountUsd = purchaseAmountUsd(purchaseKey);
            if (!amountUsd)
                throw new HTTPException(404, {
                    message: "Invalid prepaid amount or Pollen pack",
                });

            const { WEFT_SELLER_API_KEY, WEFT_PAY_TO, WEFT_NETWORK } = c.env;
            const holdingUserId = c.env.X402_HOLDING_USER_ID;
            if (
                !WEFT_SELLER_API_KEY ||
                !WEFT_PAY_TO ||
                !WEFT_NETWORK ||
                !holdingUserId ||
                !c.env.WEFT_FACILITATOR_URL
            ) {
                throw new HTTPException(503, {
                    message: "x402 prepaid keys are not configured",
                });
            }
            const [holdingUser] = await drizzle(c.env.DB)
                .select()
                .from(userTable)
                .where(eq(userTable.id, holdingUserId))
                .limit(1);
            if (!holdingUser || isUserBanned(holdingUser)) {
                throw new HTTPException(503, {
                    message: "x402 prepaid keys are unavailable",
                });
            }

            const signature = paymentSignature(c);
            let id: string | undefined;
            let recovering: Purchase | undefined;
            if (signature) {
                try {
                    id = await paymentId(signature);
                } catch {
                    throw new HTTPException(400, {
                        message: "Invalid x402 payment signature",
                    });
                }
                const previous = await getPurchase(c.env.DB, id);
                if (previous) {
                    if (
                        previous.user_id !== holdingUserId ||
                        previous.pack_key !== purchaseKey
                    )
                        throw new HTTPException(409, {
                            message:
                                "Payment already belongs to another purchase",
                        });
                    if (
                        !(await isBuyer(
                            new URL(c.req.url).origin,
                            signature,
                            c.req.header("x402-buyer-signature"),
                            c.req.header("x402-buyer-issued-at"),
                        ))
                    )
                        throw new HTTPException(409, {
                            message:
                                "x402 payment already used. Sign the recovery message with the paying wallet to get its key again.",
                        });
                    if (previous.credited_at !== null) {
                        const issued = await storedKey(c.env, previous);
                        return c.json({ ...issued, pollen: amountUsd });
                    }
                    // Recorded but not yet credited: settle again, which
                    // assumes Weft answers a repeat with the original receipt.
                    recovering = previous;
                }
            }

            let issued: { id: string; key: string } | undefined;
            const paymentRoute = {
                accepts: [
                    {
                        scheme: "exact",
                        network: WEFT_NETWORK as `${string}:${string}`,
                        payTo: WEFT_PAY_TO,
                        price: `$${amountUsd}`,
                    },
                ],
                description: `${amountUsd} prepaid Pollinations Pollen in a new API key`,
            };
            const payment = (
                weftPaymentMiddlewareHono as unknown as (
                    routes: Parameters<typeof weftPaymentMiddlewareHono>[0],
                    config: Parameters<typeof weftPaymentMiddlewareHono>[1],
                ) => MiddlewareHandler<Env>
            )(
                {
                    "GET *": paymentRoute,
                    "POST *": paymentRoute,
                },
                {
                    apiKey: WEFT_SELLER_API_KEY,
                    facilitator: { url: c.env.WEFT_FACILITATOR_URL },
                    name: "Pollinations Prepaid API Key",
                    type: "api",
                    tags: ["ai", "credits"],
                    schemes: [
                        {
                            network: WEFT_NETWORK as `${string}:${string}`,
                            server: new ExactEvmScheme(),
                        },
                    ],
                    resumeVerifiedPayment: async (_context, candidate) =>
                        recovering &&
                        (await paymentIdForPayload(
                            candidate.paymentPayload,
                        )) === id
                            ? candidate
                            : undefined,
                },
            );
            const response = await payment(c, async () => {
                if (!id)
                    throw new Error("Verified x402 payment has no signature");
                issued = recovering
                    ? await storedKey(c.env, recovering)
                    : await preparePurchase(
                          c.env,
                          c.executionCtx,
                          id,
                          holdingUserId,
                          purchaseKey,
                      );
                c.res = c.json({
                    id: issued.id,
                    key: issued.key,
                    pollen: amountUsd,
                });
            });
            if (response) c.res = response;
            if (!issued || !c.res.ok) return c.res;
            if (!c.res.headers.has("payment-response")) {
                throw new Error("x402 settlement receipt missing");
            }
            try {
                await creditPurchase(
                    c.env.DB,
                    id as string,
                    holdingUserId,
                    issued.id,
                );
            } catch (error) {
                c.get("log").error("x402 key credit failed: {error}", {
                    error,
                });
                // The paid handler already set c.res, so a returned response
                // would be ignored and the unfunded key sent with a 200.
                c.res = c.json(
                    {
                        error: "Payment settled but key activation is pending. Retry with the same payment signature and a buyer signature.",
                    },
                    503,
                );
                return c.res;
            }
            return c.res;
        },
    );
