import * as schema from "@shared/db/better-auth.ts";
import {
    QUEST_DEFINITIONS,
    type QuestDefinition,
} from "@shared/quests/definitions.ts";
import { drizzle } from "drizzle-orm/d1";

function parseCriteriaJson(raw: string | null): Record<string, unknown> | null {
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? (parsed as Record<string, unknown>)
            : null;
    } catch {
        return null;
    }
}

export type QuestCatalogItem = QuestDefinition & {
    criteria: Record<string, unknown> | null;
    storage: "checked_in" | "d1";
};

export async function listQuestCatalog(
    dbBinding: D1Database,
): Promise<QuestCatalogItem[]> {
    const db = drizzle(dbBinding, { schema });
    const rows = await db
        .select()
        .from(schema.questDefinitions)
        .orderBy(schema.questDefinitions.id);

    const byId = new Map<string, QuestCatalogItem>();
    for (const definition of QUEST_DEFINITIONS) {
        byId.set(definition.id, {
            ...definition,
            criteria: null,
            storage: "checked_in",
        });
    }

    for (const row of rows) {
        byId.set(row.id, {
            id: row.id,
            title: row.title,
            description: row.description,
            category: row.category as QuestDefinition["category"],
            status: row.status as QuestDefinition["status"],
            trigger: row.trigger as QuestDefinition["trigger"],
            rewardAmount: row.rewardAmount,
            balanceBucket:
                row.balanceBucket as QuestDefinition["balanceBucket"],
            repeatability:
                row.repeatability as QuestDefinition["repeatability"],
            criteria: parseCriteriaJson(row.criteriaJson),
            storage: "d1",
        });
    }

    return [...byId.values()];
}
