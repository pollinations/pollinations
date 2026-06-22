import { sql } from "drizzle-orm";
import type { Quest, QuestAward, QuestEvaluationContext } from "../types.ts";

// elixpo (Ayushman Bhattacharya) joined the team as an intern — a one-off
// welcome quest scoped to his GitHub account. Shown to everyone as a static
// card, but only the target account can complete it. Hand-written one-off;
// not a threshold quest.
const TARGET_GITHUB_ID = 161_109_909;
const MAX_GRANTS_PER_RUN = 1;

type ElixpoInternRow = {
    userId: string;
};

const elixpoInternQuest: Quest = {
    id: "easteregg:elixpo_intern",
    title: "Developer Relations Intern, unlocked 🌻",
    description: "It's official, elixpo — welcome to the Pollinations crew.",
    iconId: "sprout",
    category: "community",
    scope: "perUser",
    rewardAmount: 100,
    balanceBucket: "pack",
    async findRewards({ db }: QuestEvaluationContext): Promise<QuestAward[]> {
        const rows = await db.all<ElixpoInternRow>(
            sql`
            SELECT user.id AS userId
            FROM user
            WHERE user.github_id = ${TARGET_GITHUB_ID}
            LIMIT ${MAX_GRANTS_PER_RUN}`,
        );
        return rows.map((row) => ({ userId: row.userId }));
    },
};

export async function loadQuests(
    _ctx: QuestEvaluationContext,
): Promise<Quest[]> {
    return [elixpoInternQuest];
}
