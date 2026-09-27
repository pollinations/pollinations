import { weftPaymentMiddleware } from "@weftlabs/sdk/facilitator/middleware";
import { ExactEvmScheme } from "@x402/evm/exact/server";

let paymentMiddleware;

export function weftTextEnabled() {
    return Boolean(process.env.WEFT_SELLER_API_KEY && process.env.WEFT_PAY_TO &&
        process.env.WEFT_NETWORK && process.env.WEFT_FACILITATOR_URL);
}

export function weftTextPayment(req, res, next) {
    const { WEFT_SELLER_API_KEY, WEFT_PAY_TO, WEFT_NETWORK, WEFT_FACILITATOR_URL } = process.env;
    if (!WEFT_SELLER_API_KEY || !WEFT_PAY_TO || !WEFT_NETWORK || !WEFT_FACILITATOR_URL) {
        return res.status(503).json({ error: "x402 payments are not configured" });
    }

    paymentMiddleware ??= weftPaymentMiddleware(
        {
            "GET *": {
                accepts: {
                    scheme: "exact",
                    network: WEFT_NETWORK,
                    payTo: WEFT_PAY_TO,
                    price: "$0.01",
                },
                description: "Generate one text response with Pollinations",
            },
            "POST *": {
                accepts: {
                    scheme: "exact",
                    network: WEFT_NETWORK,
                    payTo: WEFT_PAY_TO,
                    price: "$0.01",
                },
                description: "Generate one text response with Pollinations",
            },
        },
        {
            apiKey: WEFT_SELLER_API_KEY,
            facilitator: { url: WEFT_FACILITATOR_URL },
            name: "Pollinations legacy text",
            type: "api",
            tags: ["text"],
            schemes: [{ network: WEFT_NETWORK, server: new ExactEvmScheme() }],
        },
    );
    return paymentMiddleware(req, res, next);
}
