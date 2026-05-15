import type { IncomingMessage, ServerResponse } from "node:http";
import { getAddress } from "viem";
import { useFacilitator } from "x402/verify";
import { facilitator as coinbaseFacilitator } from "@coinbase/x402";
import { exact } from "x402/schemes";
import {
    processPriceToAtomicAmount,
    findMatchingPaymentRequirements,
    toJsonSafe,
} from "x402/shared";
import {
    SupportedEVMNetworks,
    settleResponseHeader,
    type Network,
    type PaymentPayload,
    type PaymentRequirements,
} from "x402/types";
import debug from "debug";

const log = debug("pollinations:x402");

const X402_VERSION = 1;

const payToEnv = process.env.X402_PAY_TO;
const network = (process.env.X402_NETWORK as Network | undefined) ?? "base-sepolia";
const price = process.env.X402_PRICE ?? "$0.0001";
const description =
    process.env.X402_DESCRIPTION ??
    "Pollinations legacy image — pay to bypass rate limit";

let enabled = false;
let payTo: `0x${string}` | null = null;
let facilitator: ReturnType<typeof useFacilitator> | null = null;
type FacilitatorConfig = NonNullable<Parameters<typeof useFacilitator>[0]>;

if (payToEnv) {
    try {
        payTo = getAddress(payToEnv) as `0x${string}`;
        // For Base mainnet (and any production network) we must use the
        // authenticated Coinbase facilitator at api.cdp.coinbase.com. The
        // default x402.org/facilitator is Base Sepolia-only and returns
        // "unexpected_error" on mainnet payloads.
        //
        // CDP creds are read from CDP_API_KEY_ID + CDP_API_KEY_SECRET env.
        // For testnet-only setups, leaving them unset still works against
        // the free Sepolia facilitator below.
        const hasCdpCreds =
            !!process.env.CDP_API_KEY_ID && !!process.env.CDP_API_KEY_SECRET;
        if (network === "base-sepolia" && !hasCdpCreds) {
            facilitator = useFacilitator();
            log("[x402] facilitator: free x402.org (Sepolia only)");
        } else {
            facilitator = useFacilitator(
                coinbaseFacilitator as unknown as FacilitatorConfig,
            );
            log(
                `[x402] facilitator: coinbase CDP (creds present=${hasCdpCreds})`,
            );
        }
        enabled = true;
        log(`[x402] enabled: payTo=${payTo} network=${network} price=${price}`);
    } catch (err) {
        log(`[x402] disabled: invalid X402_PAY_TO (${err})`);
    }
} else {
    log("[x402] X402_PAY_TO not set; x402 disabled");
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

export function buildPaymentRequirements(
    req: IncomingMessage,
): PaymentRequirements[] {
    if (!enabled || !payTo) return [];
    if (!SupportedEVMNetworks.includes(network)) {
        throw new Error(`Unsupported x402 network: ${network}`);
    }
    const atomic = processPriceToAtomicAmount(price, network);
    if ("error" in atomic) throw new Error(atomic.error);
    const { maxAmountRequired, asset } = atomic;
    const eip712Asset = asset as typeof asset & {
        eip712: Record<string, string>;
    };

    return [
        {
            scheme: "exact",
            network,
            maxAmountRequired,
            resource: resourceUrlFor(req) as `${string}://${string}`,
            description,
            mimeType: "image/jpeg",
            payTo: getAddress(payTo),
            maxTimeoutSeconds: 60,
            asset: getAddress(asset.address),
            outputSchema: {
                input: {
                    type: "http",
                    method: (req.method ?? "GET").toUpperCase(),
                    discoverable: true,
                },
            },
            extra: eip712Asset.eip712,
        },
    ];
}

export type VerifyOutcome =
    | { ok: true; payload: PaymentPayload; requirements: PaymentRequirements }
    | { ok: false; status: 402; body: object };

export async function verifyIncomingPayment(
    req: IncomingMessage,
): Promise<VerifyOutcome | null> {
    if (!enabled || !facilitator) return null;
    const header = req.headers["x-payment"];
    const paymentHeader = Array.isArray(header) ? header[0] : header;
    if (!paymentHeader) return null;

    let requirements: PaymentRequirements[];
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
        decoded = exact.evm.decodePayment(paymentHeader);
        decoded.x402Version = X402_VERSION;
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
                accepts: toJsonSafe(requirements),
            },
        };
    }

    const selected = findMatchingPaymentRequirements(requirements, decoded);
    if (!selected) {
        return {
            ok: false,
            status: 402,
            body: {
                x402Version: X402_VERSION,
                error: "Unable to find matching payment requirements",
                accepts: toJsonSafe(requirements),
            },
        };
    }

    try {
        log(
            "[x402] verify start: payer=%s amount=%s asset=%s network=%s nonce=%s",
            (decoded as any)?.payload?.authorization?.from,
            (decoded as any)?.payload?.authorization?.value,
            selected.asset,
            selected.network,
            (decoded as any)?.payload?.authorization?.nonce,
        );
        const result = await facilitator.verify(decoded, selected);
        log("[x402] verify result: %o", result);
        if (!result.isValid) {
            return {
                ok: false,
                status: 402,
                body: {
                    x402Version: X402_VERSION,
                    error: result.invalidReason,
                    accepts: toJsonSafe(requirements),
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
                accepts: toJsonSafe(requirements),
            },
        };
    }

    return { ok: true, payload: decoded, requirements: selected };
}

export function send402Challenge(
    req: IncomingMessage,
    res: ServerResponse,
    errorMsg: string,
): void {
    let accepts: object[] = [];
    try {
        accepts = toJsonSafe(buildPaymentRequirements(req)) as object[];
    } catch (err) {
        log(`failed to build accepts: ${err}`);
    }
    res.writeHead(402, { "Content-Type": "application/json" });
    res.end(
        JSON.stringify({
            x402Version: X402_VERSION,
            error: errorMsg,
            accepts,
        }),
    );
}

export async function settleAndStampHeader(
    res: ServerResponse,
    payload: PaymentPayload,
    requirements: PaymentRequirements,
    headers: Record<string, string | number>,
): Promise<{ ok: true } | { ok: false; status: 402; body: object }> {
    if (!facilitator) return { ok: true };
    try {
        log("[x402] settle start");
        const settleResp = await facilitator.settle(payload, requirements);
        log("[x402] settle result: %o", settleResp);
        if (!settleResp.success) {
            return {
                ok: false,
                status: 402,
                body: {
                    x402Version: X402_VERSION,
                    error: settleResp.errorReason,
                    accepts: toJsonSafe([requirements]),
                },
            };
        }
        headers["X-PAYMENT-RESPONSE"] = settleResponseHeader(settleResp);
        return { ok: true };
    } catch (err) {
        return {
            ok: false,
            status: 402,
            body: {
                x402Version: X402_VERSION,
                error:
                    err instanceof Error ? err.message : "Payment settlement failed",
                accepts: toJsonSafe([requirements]),
            },
        };
    }
}
