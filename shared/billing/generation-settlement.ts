import { getLogger } from "@logtape/logtape";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { type DrizzleD1Database, drizzle } from "drizzle-orm/d1";
import { apikey as apikeyTable } from "../db/better-auth.ts";
import type { Bucket } from "./deduction.ts";
import { computeDevCredit, MARKUP_PCT } from "./markup.ts";
import { roundPollenLedgerAmount } from "./precision.ts";

const log = getLogger(["billing", "settlement"]);

export type SettlementPayoutKind = "creator" | "supplier";

export type SettlementPayout = {
    kind: SettlementPayoutKind;
    recipientUserId: string;
    amount: number;
    rate: number;
};

export type GenerationSettlement = {
    settlementId: string;
    payerUserId: string | null;
    apiKeyId: string | null;
    baseCharge: number;
    payerCharge: number;
    payerBucket: Bucket | null;
    payouts: SettlementPayout[];
    postSettlementPackBalance: number | null;
};

export type SupplierPayoutInput = {
    userId: string;
    rate: number;
};

type SettlementParams = {
    d1: D1Database;
    settlementId: string;
    isBilledUsage: boolean;
    baseCharge?: number;
    payerUserId?: string;
    apiKeyId?: string;
    apiKeyPollenBalance?: number | null;
    creatorKeyId?: string | null;
    modelPaidOnly?: boolean;
    supplierPayout?: SupplierPayoutInput | null;
};

type StoredSettlementRow = {
    settlementId: string;
    payerUserId: string;
    apiKeyId: string | null;
    baseCharge: number;
    payerCharge: number;
    payerBucket: Bucket;
    payoutsJson: string;
    postSettlementPackBalance: number | null;
};

function parseMetadata(
    raw: string | null | undefined,
): Record<string, unknown> {
    if (!raw) return {};
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? parsed
            : {};
    } catch {
        return {};
    }
}

export async function resolveCreatorPayout(
    db: DrizzleD1Database,
    creatorKeyId: string | null | undefined,
    baseCharge: number,
    payerUserId: string | undefined,
): Promise<SettlementPayout | null> {
    if (!creatorKeyId || !payerUserId) return null;

    const amount = roundPollenLedgerAmount(computeDevCredit(baseCharge));
    if (amount <= 0) return null;

    const [clientRow] = await db
        .select({ userId: apikeyTable.userId, metadata: apikeyTable.metadata })
        .from(apikeyTable)
        .where(
            and(
                eq(apikeyTable.id, creatorKeyId),
                eq(apikeyTable.prefix, "pk"),
                eq(apikeyTable.enabled, true),
                or(
                    isNull(apikeyTable.expiresAt),
                    gt(apikeyTable.expiresAt, new Date()),
                ),
            ),
        )
        .limit(1);

    if (!clientRow?.userId) return null;
    if (parseMetadata(clientRow.metadata).earningsEnabled !== true) return null;
    if (clientRow.userId === payerUserId) return null;

    return {
        kind: "creator",
        recipientUserId: clientRow.userId,
        amount,
        rate: MARKUP_PCT,
    };
}

export function resolveSupplierPayout(
    input: SupplierPayoutInput | null | undefined,
    baseCharge: number,
): SettlementPayout | null {
    if (!input || baseCharge <= 0 || input.rate <= 0) return null;

    const amount = roundPollenLedgerAmount(baseCharge * input.rate);
    if (amount <= 0) return null;

    return {
        kind: "supplier",
        recipientUserId: input.userId,
        amount,
        rate: input.rate,
    };
}

/**
 * Commits one generation charge and all payouts as a single idempotent D1
 * batch. The settlement insert gates every later statement via `changes()`, so
 * retrying the same server-generated settlement id reads the original
 * settlement without moving any balance twice.
 */
export async function settleGeneration(
    params: SettlementParams,
): Promise<GenerationSettlement> {
    const {
        d1,
        settlementId,
        isBilledUsage,
        baseCharge: rawBaseCharge,
        payerUserId,
        apiKeyId,
        apiKeyPollenBalance,
        creatorKeyId,
        modelPaidOnly = false,
        supplierPayout: supplierPayoutInput,
    } = params;

    if (!isBilledUsage || rawBaseCharge == null || rawBaseCharge === 0) {
        return emptySettlement(settlementId, payerUserId, apiKeyId);
    }
    if (!payerUserId) {
        throw new Error("Billed generation requires a payer user");
    }

    const baseCharge = roundPollenLedgerAmount(rawBaseCharge);
    if (baseCharge <= 0) {
        return emptySettlement(settlementId, payerUserId, apiKeyId);
    }

    const existing = await loadSettlement(d1, settlementId);
    if (existing) {
        assertSameSettlementCore(existing, {
            payerUserId,
            apiKeyId: apiKeyId ?? null,
            baseCharge,
        });
        return toGenerationSettlement(existing);
    }

    const db = drizzle(d1);
    const creatorPayout = await resolveCreatorPayout(
        db,
        creatorKeyId,
        baseCharge,
        payerUserId,
    );
    const supplierPayout = resolveSupplierPayout(
        supplierPayoutInput,
        baseCharge,
    );
    const payouts = [creatorPayout, supplierPayout].filter(
        (payout): payout is SettlementPayout => payout !== null,
    );
    const payerCharge = roundPollenLedgerAmount(
        baseCharge + (creatorPayout?.amount ?? 0),
    );
    const payoutsJson = JSON.stringify(payouts);
    const hasFiniteApiKeyBudget =
        apiKeyId !== undefined && typeof apiKeyPollenBalance === "number";

    const dependencyChecks = [
        ...(hasFiniteApiKeyBudget
            ? [
                  "AND EXISTS (SELECT 1 FROM apikey WHERE id = ? AND pollen_balance IS NOT NULL)",
              ]
            : []),
        ...payouts.map(() => "AND EXISTS (SELECT 1 FROM user WHERE id = ?)"),
    ].join("\n");
    const dependencyBindings = [
        ...(hasFiniteApiKeyBudget ? [apiKeyId] : []),
        ...payouts.map((payout) => payout.recipientUserId),
    ];

    const statements: D1PreparedStatement[] = [
        d1
            .prepare(
                `INSERT OR IGNORE INTO generation_settlement (
                    request_id,
                    payer_user_id,
                    api_key_id,
                    base_charge,
                    payer_charge,
                    payer_bucket,
                    payouts_json,
                    post_settlement_pack_balance,
                    created_at
                )
                SELECT
                    ?,
                    payer.id,
                    ?,
                    ?,
                    ?,
                    CASE
                        WHEN ? = 1 THEN 'pack'
                        WHEN COALESCE(payer.tier_balance, 0) >= ? THEN 'tier'
                        WHEN COALESCE(payer.pack_balance, 0) > 0 THEN 'pack'
                        ELSE 'tier'
                    END,
                    ?,
                    NULL,
                    ?
                FROM user AS payer
                WHERE payer.id = ?
                ${dependencyChecks}`,
            )
            .bind(
                settlementId,
                apiKeyId ?? null,
                baseCharge,
                payerCharge,
                modelPaidOnly ? 1 : 0,
                payerCharge,
                payoutsJson,
                Date.now(),
                payerUserId,
                ...dependencyBindings,
            ),
        d1
            .prepare(
                `UPDATE user
                SET
                    tier_balance = CASE
                        WHEN (SELECT payer_bucket FROM generation_settlement WHERE request_id = ?) = 'tier'
                            THEN COALESCE(tier_balance, 0) - ?
                        ELSE tier_balance
                    END,
                    pack_balance = CASE
                        WHEN (SELECT payer_bucket FROM generation_settlement WHERE request_id = ?) = 'pack'
                            THEN COALESCE(pack_balance, 0) - ?
                        ELSE pack_balance
                    END
                WHERE id = ? AND changes() = 1`,
            )
            .bind(
                settlementId,
                payerCharge,
                settlementId,
                payerCharge,
                payerUserId,
            ),
        d1
            .prepare(
                `UPDATE generation_settlement
                SET post_settlement_pack_balance = (
                    SELECT pack_balance FROM user WHERE id = payer_user_id
                )
                WHERE request_id = ? AND changes() = 1`,
            )
            .bind(settlementId),
    ];

    if (hasFiniteApiKeyBudget) {
        // Budgets are soft: preflight gates on an estimate, but this final
        // actual-usage charge may consume the remainder and clamps at zero.
        statements.push(
            d1
                .prepare(
                    `UPDATE apikey
                    SET pollen_balance = MAX(0, pollen_balance - ?)
                    WHERE id = ?
                      AND pollen_balance IS NOT NULL
                      AND changes() = 1`,
                )
                .bind(payerCharge, apiKeyId),
        );
    }

    for (const payout of payouts) {
        statements.push(
            d1
                .prepare(
                    `UPDATE user
                    SET
                        tier_balance = CASE
                            WHEN (SELECT payer_bucket FROM generation_settlement WHERE request_id = ?) = 'tier'
                                THEN COALESCE(tier_balance, 0) + ?
                            ELSE tier_balance
                        END,
                        pack_balance = CASE
                            WHEN (SELECT payer_bucket FROM generation_settlement WHERE request_id = ?) = 'pack'
                                THEN COALESCE(pack_balance, 0) + ?
                            ELSE pack_balance
                        END
                    WHERE id = ? AND changes() = 1`,
                )
                .bind(
                    settlementId,
                    payout.amount,
                    settlementId,
                    payout.amount,
                    payout.recipientUserId,
                ),
        );
    }

    const results = await d1.batch(statements);
    const inserted = (results[0]?.meta.changes ?? 0) === 1;
    const stored = await loadSettlement(d1, settlementId);
    if (!stored) {
        throw new Error(
            `Generation settlement dependencies missing for ${settlementId}`,
        );
    }

    assertSameSettlement(stored, {
        settlementId,
        payerUserId,
        apiKeyId: apiKeyId ?? null,
        baseCharge,
        payerCharge,
        payoutsJson,
    });

    if (
        inserted &&
        results.slice(1).some((result) => result.meta.changes !== 1)
    ) {
        throw new Error(`Generation settlement incomplete for ${settlementId}`);
    }

    const settlement = toGenerationSettlement(stored);
    log.debug(
        "Settled generation {settlementId}: charged {payerCharge} to {payerUserId} from {payerBucket} with {payoutCount} payouts",
        {
            settlementId,
            payerCharge,
            payerUserId,
            payerBucket: settlement.payerBucket,
            payoutCount: payouts.length,
        },
    );
    return settlement;
}

function emptySettlement(
    settlementId: string,
    payerUserId: string | undefined,
    apiKeyId: string | undefined,
): GenerationSettlement {
    return {
        settlementId,
        payerUserId: payerUserId ?? null,
        apiKeyId: apiKeyId ?? null,
        baseCharge: 0,
        payerCharge: 0,
        payerBucket: null,
        payouts: [],
        postSettlementPackBalance: null,
    };
}

async function loadSettlement(
    d1: D1Database,
    settlementId: string,
): Promise<StoredSettlementRow | null> {
    return d1
        .prepare(
            `SELECT
                request_id AS settlementId,
                payer_user_id AS payerUserId,
                api_key_id AS apiKeyId,
                base_charge AS baseCharge,
                payer_charge AS payerCharge,
                payer_bucket AS payerBucket,
                payouts_json AS payoutsJson,
                post_settlement_pack_balance AS postSettlementPackBalance
            FROM generation_settlement
            WHERE request_id = ?`,
        )
        .bind(settlementId)
        .first<StoredSettlementRow>();
}

function assertSameSettlement(
    stored: StoredSettlementRow,
    expected: Omit<
        StoredSettlementRow,
        "payerBucket" | "postSettlementPackBalance"
    >,
): void {
    if (
        stored.payerUserId !== expected.payerUserId ||
        stored.apiKeyId !== expected.apiKeyId ||
        stored.baseCharge !== expected.baseCharge ||
        stored.payerCharge !== expected.payerCharge ||
        stored.payoutsJson !== expected.payoutsJson
    ) {
        throw new Error(
            `Settlement ${expected.settlementId} was already used for a different generation`,
        );
    }
}

function assertSameSettlementCore(
    stored: StoredSettlementRow,
    expected: Pick<
        StoredSettlementRow,
        "payerUserId" | "apiKeyId" | "baseCharge"
    >,
): void {
    if (
        stored.payerUserId !== expected.payerUserId ||
        stored.apiKeyId !== expected.apiKeyId ||
        stored.baseCharge !== expected.baseCharge
    ) {
        throw new Error(
            `Settlement ${stored.settlementId} was already used for a different generation`,
        );
    }
}

function toGenerationSettlement(
    row: StoredSettlementRow,
): GenerationSettlement {
    return {
        settlementId: row.settlementId,
        payerUserId: row.payerUserId,
        apiKeyId: row.apiKeyId,
        baseCharge: row.baseCharge,
        payerCharge: row.payerCharge,
        payerBucket: row.payerBucket,
        payouts: JSON.parse(row.payoutsJson) as SettlementPayout[],
        postSettlementPackBalance:
            row.payerBucket === "pack" ? row.postSettlementPackBalance : null,
    };
}
