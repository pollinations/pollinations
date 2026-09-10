import { parseMetadata } from "../auth/api-key-metadata.ts";
import { roundPollenLedgerAmount } from "./precision.ts";

/**
 * BYOP markup applied to requests authenticated by a BYOP-issued sk_ token with
 * a trusted byop_client_key_id. The payer is billed baseline + markup; the
 * markup is credited to the app owner's matching Quest Pollen or pack balance.
 */
export const MARKUP_PCT = 0.25;
export const MIN_MARKUP_PCT = 0.1;
export const MAX_MARKUP_PCT = 0.5;

/**
 * Resolve the effective markup percentage from the client's metadata.
 * Returns the clamped value within [MIN_MARKUP_PCT, MAX_MARKUP_PCT],
 * or MARKUP_PCT when absent / invalid.
 */
export function resolveMarkupPct(
    metadata: Record<string, unknown> | null | undefined,
): number {
    if (!metadata || typeof metadata.markupPct !== "number") return MARKUP_PCT;
    const clamped = Math.max(
        MIN_MARKUP_PCT,
        Math.min(MAX_MARKUP_PCT, metadata.markupPct),
    );
    return Number.isFinite(clamped) ? clamped : MARKUP_PCT;
}

export function computeDevCredit(
    baselinePrice: number,
    markupPct: number = MARKUP_PCT,
): number {
    const clamped = Math.max(
        MIN_MARKUP_PCT,
        Math.min(MAX_MARKUP_PCT, markupPct),
    );
    if (baselinePrice <= 0 || clamped <= 0) return 0;
    return baselinePrice * clamped;
}

export type ByopClientMarkupFields = {
    userId?: string | null;
    prefix?: string | null;
    enabled?: boolean | null;
    expiresAt?: Date | string | null;
    metadata?: string | Record<string, unknown> | null;
};

/**
 * Same eligibility `resolveDevMarkup` uses after its D1 lookup. Auth computes
 * this from the already-joined publishable key so preflight can include markup
 * without a second query.
 */
export function byopClientAllowsMarkup(
    client: ByopClientMarkupFields | null | undefined,
    payerUserId: string | undefined,
): boolean {
    if (!client?.userId || !payerUserId) return false;
    if (client.prefix !== "pk") return false;
    if (client.enabled !== true) return false;
    if (client.expiresAt && new Date(client.expiresAt) <= new Date()) {
        return false;
    }
    const metadata =
        typeof client.metadata === "string"
            ? parseMetadata(client.metadata)
            : (client.metadata ?? {});
    if (metadata.earningsEnabled !== true) return false;
    return client.userId !== payerUserId;
}

/** Baseline plus BYOP markup, rounded the same way deduction bills. */
export function withByopMarkup(
    baselinePrice: number,
    applies: boolean,
    markupPct: number = MARKUP_PCT,
): number {
    const baseline = Math.max(0, baselinePrice);
    if (!applies) return baseline;
    return roundPollenLedgerAmount(
        baseline + computeDevCredit(baseline, markupPct),
    );
}
