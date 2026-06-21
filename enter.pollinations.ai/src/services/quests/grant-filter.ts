import type { GrantRewardInput } from "@shared/billing/grant-reward.ts";
import * as schema from "@shared/db/better-auth.ts";
import { inArray } from "drizzle-orm";
import type { QuestDb } from "./types.ts";

const SQLITE_BIND_LIMIT_BUFFER = 500;

export async function excludeExistingGrants(
    db: QuestDb,
    grants: GrantRewardInput[],
): Promise<GrantRewardInput[]> {
    if (!grants.length) return grants;

    const existing = new Set<string>();
    const keys = grants.map((grant) => grant.idempotencyKey);

    for (
        let index = 0;
        index < keys.length;
        index += SQLITE_BIND_LIMIT_BUFFER
    ) {
        const chunk = keys.slice(index, index + SQLITE_BIND_LIMIT_BUFFER);
        const rows = await db
            .select({ idempotencyKey: schema.rewardGrants.idempotencyKey })
            .from(schema.rewardGrants)
            .where(inArray(schema.rewardGrants.idempotencyKey, chunk));
        for (const row of rows) existing.add(row.idempotencyKey);
    }

    return grants.filter((grant) => !existing.has(grant.idempotencyKey));
}
