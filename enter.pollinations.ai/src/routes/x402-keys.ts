import { isUserBanned } from "@shared/auth/ban.ts";
import { user as userTable } from "@shared/db/better-auth.ts";
import { getPollenPackByKey, POLLEN_PACKS } from "@shared/pollen-packs.ts";
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
    paymentId,
    paymentIdForPayload,
    preparePurchase,
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
            summary: "List x402 prepaid key packs",
            description:
                "Buy a new secret API key without a Pollinations login. POST to a pack URL to receive an x402 payment challenge.",
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
    .post(
        "/:packKey",
        describeRoute({
            tags: ["👤 Account"],
            summary: "Buy a prepaid API key with x402",
            description:
                "Returns 402 with exact USDC payment terms; retry with PAYMENT-SIGNATURE. A successful payment returns a budgeted sk_ key. Replaying the same settled payment returns the same key, not more credits.",
            responses: {
                200: { description: "Prepaid API key" },
                402: { description: "x402 payment required" },
                503: { description: "Purchases are not configured" },
            },
        }),
        async (c) => {
            c.header("Cache-Control", "private, no-store");
            const pack = getPollenPackByKey(c.req.param("packKey"));
            if (!pack)
                throw new HTTPException(404, {
                    message: "Unknown Pollen pack",
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
            if (signature) {
                try {
                    id = await paymentId(signature);
                } catch {
                    throw new HTTPException(400, {
                        message: "Invalid x402 payment signature",
                    });
                }
                const previous = await getPurchase(c.env.DB, id);
                if (previous && previous.credited_at !== null) {
                    const issued = await preparePurchase(
                        c.env,
                        c.executionCtx,
                        id,
                        holdingUserId,
                        pack.packKey,
                    );
                    return c.json({
                        id: issued.id,
                        key: issued.key,
                        pollen: pack.amountUsd,
                    });
                }
            }

            let issued: { id: string; key: string } | undefined;
            const payment = (
                weftPaymentMiddlewareHono as unknown as (
                    routes: Parameters<typeof weftPaymentMiddlewareHono>[0],
                    config: Parameters<typeof weftPaymentMiddlewareHono>[1],
                ) => MiddlewareHandler<Env>
            )(
                {
                    "POST *": {
                        accepts: [
                            {
                                scheme: "exact",
                                network: WEFT_NETWORK as `${string}:${string}`,
                                payTo: WEFT_PAY_TO,
                                price: `$${pack.amountUsd}`,
                            },
                        ],
                        description: `${pack.amountUsd} prepaid Pollinations Pollen in a new API key`,
                    },
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
                    resumeVerifiedPayment: async (_context, candidate) => {
                        const candidateId = await paymentIdForPayload(
                            candidate.paymentPayload,
                        );
                        const pending = await getPurchase(
                            c.env.DB,
                            candidateId,
                        );
                        if (
                            !pending ||
                            pending.credited_at !== null ||
                            pending.user_id !== holdingUserId ||
                            pending.pack_key !== pack.packKey
                        )
                            return undefined;
                        return candidate;
                    },
                },
            );
            const response = await payment(c, async () => {
                if (!id)
                    throw new Error("Verified x402 payment has no signature");
                issued = await preparePurchase(
                    c.env,
                    c.executionCtx,
                    id,
                    holdingUserId,
                    pack.packKey,
                );
                c.res = c.json({
                    id: issued.id,
                    key: issued.key,
                    pollen: pack.amountUsd,
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
                return c.json(
                    {
                        error: "Payment settled but key activation is pending. Retry with the same payment signature.",
                    },
                    503,
                );
            }
            return c.res;
        },
    );
