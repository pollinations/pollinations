import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "../db/better-auth.ts";
import { rewardGrants as rewardGrantsTable } from "../db/better-auth.ts";
import { atomicCreditUserBalance, type Bucket } from "./deduction.ts";

export type RewardGrantSource =
    | "code_quest"
    | "quest"
    | "onboarding"
    | "spend"
    | "manual";

export type RewardGrantInput = {
    idempotencyKey: string;
    userId: string;
    source: RewardGrantSource | string;
    amount: number;
    balanceBucket: Bucket;
    questId?: string | null;
    sourceRef?: string | null;
    metadata?: Record<string, unknown> | null;
};

export type RewardGrantResult = {
    granted: boolean;
    idempotencyKey: string;
    grantId?: string;
    newBalance?: number | null;
};

type AuthDb = DrizzleD1Database<typeof schema>;

function requireNonEmpty(value: string, name: string): void {
    if (value.trim().length === 0) {
        throw new Error(`${name} is required`);
    }
}

function serializeMetadata(
    metadata: RewardGrantInput["metadata"],
): string | null {
    if (!metadata) return null;
    return JSON.stringify(metadata);
}

export async function grantReward(
    db: AuthDb | DrizzleD1Database,
    input: RewardGrantInput,
): Promise<RewardGrantResult> {
    requireNonEmpty(input.idempotencyKey, "idempotencyKey");
    requireNonEmpty(input.userId, "userId");
    requireNonEmpty(input.source, "source");

    if (!Number.isFinite(input.amount) || input.amount <= 0) {
        throw new Error(
            `amount must be a positive number, got ${input.amount}`,
        );
    }

    const grantId = crypto.randomUUID();
    const rows = await (db as AuthDb)
        .insert(rewardGrantsTable)
        .values({
            id: grantId,
            idempotencyKey: input.idempotencyKey,
            userId: input.userId,
            source: input.source,
            questId: input.questId ?? null,
            amount: input.amount,
            balanceBucket: input.balanceBucket,
            sourceRef: input.sourceRef ?? null,
            metadataJson: serializeMetadata(input.metadata),
            createdAt: new Date(),
        })
        .onConflictDoNothing({
            target: rewardGrantsTable.idempotencyKey,
        })
        .returning({ id: rewardGrantsTable.id });

    if (rows.length === 0) {
        return {
            granted: false,
            idempotencyKey: input.idempotencyKey,
        };
    }

    const credit = await atomicCreditUserBalance(
        db as DrizzleD1Database,
        input.userId,
        input.balanceBucket,
        input.amount,
    );

    if (!credit.ok) {
        throw new Error(
            `Reward grant inserted but balance credit failed for user ${input.userId}`,
        );
    }

    return {
        granted: true,
        idempotencyKey: input.idempotencyKey,
        grantId,
        newBalance: credit.newBalance,
    };
}
