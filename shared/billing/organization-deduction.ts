import { sql } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { organization as organizationTable } from "../db/better-auth.ts";

/**
 * Organization balance is paid-only (no tier/quest bucket), so unlike
 * {@link import("./deduction.ts").atomicDeductUserBalance} there is no
 * tier-vs-pack decision to make — this is a single unconditional UPDATE.
 * Kept as its own function rather than a parameterized "owner type" on the
 * user functions, since threading that through `bucket-selection.ts` would
 * complicate a decision (tier vs. pack) organizations don't have.
 */
export async function atomicDeductOrganizationBalance(
    db: DrizzleD1Database,
    organizationId: string,
    amount: number,
): Promise<{ ok: boolean; packBalance: number | null }> {
    if (amount <= 0) return { ok: true, packBalance: null };

    const row = await db.get<{ packBalance: number | null }>(sql`
        UPDATE ${organizationTable}
        SET pack_balance = pack_balance - ${amount}
        WHERE id = ${organizationId}
        RETURNING pack_balance AS packBalance
    `);

    return { ok: !!row, packBalance: row?.packBalance ?? null };
}
