import type { IncomingMessage, ServerResponse } from "node:http";
import { getAddress } from "viem";
import {
    HTTPFacilitatorClient,
    decodePaymentSignatureHeader,
    encodePaymentResponseHeader,
} from "@x402/core/http";
import type {
    PaymentRequired,
    PaymentRequirements,
    PaymentPayload,
} from "@x402/core/types";
import { facilitator as coinbaseFacilitator } from "@coinbase/x402";
import debug from "debug";

const log = debug("pollinations:x402");

const X402_VERSION = 2;

// Map our short network name to CAIP-2.
const NETWORK_MAP: Record<string, { caip2: string; usdc: string }> = {
    base: {
        caip2: "eip155:8453",
        usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    },
    "base-sepolia": {
        caip2: "eip155:84532",
        usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    },
};

const payToEnv = process.env.X402_PAY_TO;
const networkKey = process.env.X402_NETWORK ?? "base-sepolia";
const networkCfg = NETWORK_MAP[networkKey];
// Price in atomic USDC (6 decimals). "100" = $0.0001.
const priceAtomic = process.env.X402_PRICE_ATOMIC ?? "100";
const description =
    process.env.X402_DESCRIPTION ??
    "Pollinations legacy image — pay to bypass rate limit";

// systemd's Environment= directive silently truncates multi-line values, so
// PEM EC private keys can't be set directly. Accept the secret as base64 via
// CDP_API_KEY_SECRET_B64 and inflate it here before the SDK reads env.
if (
    !process.env.CDP_API_KEY_SECRET &&
    process.env.CDP_API_KEY_SECRET_B64
) {
    process.env.CDP_API_KEY_SECRET = Buffer.from(
        process.env.CDP_API_KEY_SECRET_B64,
        "base64",
    ).toString("utf8");
}

const hasCdpCreds =
    !!process.env.CDP_API_KEY_ID && !!process.env.CDP_API_KEY_SECRET;
const needsCdpFacilitator = networkKey !== "base-sepolia";

let enabled = false;
let payTo: `0x${string}` | null = null;
let client: HTTPFacilitatorClient | null = null;

if (!networkCfg) {
    log(`[x402] disabled: unknown network ${networkKey}`);
} else if (!payToEnv) {
    log("[x402] X402_PAY_TO not set; x402 disabled");
} else {
    try {
        payTo = getAddress(payToEnv) as `0x${string}`;
        if (needsCdpFacilitator && !hasCdpCreds) {
            log(
                "[x402] disabled: mainnet requires CDP_API_KEY_ID + CDP_API_KEY_SECRET",
            );
        } else {
            client = new HTTPFacilitatorClient(
                needsCdpFacilitator ? coinbaseFacilitator : undefined,
            );
            enabled = true;
            log(
                `[x402] enabled: payTo=${payTo} network=${networkCfg.caip2} price=${priceAtomic}`,
            );
        }
    } catch (err) {
        log(`[x402] disabled: invalid X402_PAY_TO (${err})`);
    }
}

export function x402Enabled(): boolean {
    return enabled;
}

function resourceUrlFor(req: IncomingMessage): string {
    const fwdHost = req.headers["x-forwarded-host"];
    const host =
        (Array.isArray(fwdHost) ? fwdHost[0] : fwdHost) ??
        req.headers.host ??
        "image.pollinations.ai";
    const fwdProto = req.headers["x-forwarded-proto"];
    const proto =
        (Array.isArray(fwdProto) ? fwdProto[0] : fwdProto) ?? "https";
    return `${proto}://${host}${req.url ?? "/"}`;
}

export type PaymentPayloadV2 = PaymentPayload;

export function buildPaymentRequirements(
    req: IncomingMessage,
): PaymentRequirements {
    if (!enabled || !payTo || !networkCfg) {
        throw new Error("x402 not configured");
    }
    return {
        scheme: "exact",
        network: networkCfg.caip2 as `${string}:${string}`,
        amount: priceAtomic,
        asset: getAddress(networkCfg.usdc),
        payTo: getAddress(payTo),
        maxTimeoutSeconds: 60,
        extra: null,
    };
}

function buildChallenge(req: IncomingMessage, errorMsg: string): PaymentRequired {
    return {
        x402Version: X402_VERSION,
        error: errorMsg,
        resource: {
            url: resourceUrlFor(req),
            description,
            mimeType: "image/jpeg",
        },
        accepts: [buildPaymentRequirements(req)],
    };
}

export type VerifyOutcome =
    | { ok: true; payload: PaymentPayload; requirements: PaymentRequirements }
    | { ok: false; status: 402; body: object };

export async function verifyIncomingPayment(
    req: IncomingMessage,
): Promise<VerifyOutcome | null> {
    if (!enabled || !client) return null;
    const header = req.headers["x-payment"];
    const paymentHeader = Array.isArray(header) ? header[0] : header;
    if (!paymentHeader) return null;

    let requirements: PaymentRequirements;
    try {
        requirements = buildPaymentRequirements(req);
    } catch (err) {
        return {
            ok: false,
            status: 402,
            body: {
                x402Version: X402_VERSION,
                error:
                    err instanceof Error
                        ? err.message
                        : "x402 misconfigured on server",
                accepts: [],
            },
        };
    }

    let decoded: PaymentPayload;
    try {
        decoded = decodePaymentSignatureHeader(paymentHeader);
    } catch (err) {
        return {
            ok: false,
            status: 402,
            body: {
                x402Version: X402_VERSION,
                error:
                    err instanceof Error
                        ? err.message
                        : "Invalid or malformed payment header",
                accepts: [requirements],
            },
        };
    }

    try {
        log(
            "[x402] verify start: scheme=%s network=%s amount=%s asset=%s",
            requirements.scheme,
            requirements.network,
            requirements.amount,
            requirements.asset,
        );
        const result = await client.verify(decoded, requirements);
        log("[x402] verify result: %o", result);
        if (!result.isValid) {
            return {
                ok: false,
                status: 402,
                body: {
                    x402Version: X402_VERSION,
                    error: result.invalidReason ?? "verification_failed",
                    accepts: [requirements],
                    payer: result.payer,
                },
            };
        }
    } catch (err) {
        log("[x402] verify threw: %o", err);
        return {
            ok: false,
            status: 402,
            body: {
                x402Version: X402_VERSION,
                error:
                    err instanceof Error
                        ? err.message
                        : "Payment verification failed",
                accepts: [requirements],
            },
        };
    }

    return { ok: true, payload: decoded, requirements };
}

export function send402Challenge(
    req: IncomingMessage,
    res: ServerResponse,
    errorMsg: string,
): void {
    let body: object;
    try {
        body = buildChallenge(req, errorMsg) as unknown as object;
    } catch (err) {
        log("[x402] failed to build challenge: %o", err);
        body = {
            x402Version: X402_VERSION,
            error:
                err instanceof Error
                    ? err.message
                    : "x402 misconfigured on server",
            accepts: [],
        };
    }
    res.writeHead(402, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
}

export async function settleAndStampHeader(
    res: ServerResponse,
    payload: PaymentPayload,
    requirements: PaymentRequirements,
    headers: Record<string, string | number>,
): Promise<{ ok: true } | { ok: false; status: 402; body: object }> {
    if (!client) return { ok: true };
    try {
        log("[x402] settle start");
        const settleResp = await client.settle(payload, requirements);
        log("[x402] settle result: %o", settleResp);
        if (!settleResp.success) {
            return {
                ok: false,
                status: 402,
                body: {
                    x402Version: X402_VERSION,
                    error: settleResp.errorReason ?? "settlement_failed",
                    accepts: [requirements],
                },
            };
        }
        headers["X-PAYMENT-RESPONSE"] = encodePaymentResponseHeader(settleResp);
        return { ok: true };
    } catch (err) {
        log("[x402] settle threw: %o", err);
        return {
            ok: false,
            status: 402,
            body: {
                x402Version: X402_VERSION,
                error:
                    err instanceof Error
                        ? err.message
                        : "Payment settlement failed",
                accepts: [requirements],
            },
        };
    }
}
