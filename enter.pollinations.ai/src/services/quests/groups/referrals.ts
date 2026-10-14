import { rewardKey } from "@shared/billing/rewards.ts";
import { sql } from "drizzle-orm";
import type { QuestDefinition } from "../definitions.ts";
import {
    type QuestCard,
    type QuestDb,
    type QuestEvaluation,
    type QuestEvaluationContext,
    type QuestUser,
    questToCard,
} from "../types.ts";
import { MIN_POLLEN_BOUGHT, pollenBoughtSql } from "./github-contributions.ts";

/**
 * Referrals: `user.referred_by` names who brought a user, set once near signup
 * by an invite link (auth.ts) or a BYOP app login (attributeAppSignup). The
 * referrer earns the reward once per referred GitHub identity, as soon as that
 * user has bought more than MIN_POLLEN_BOUGHT Pollen.
 */

/** The GitHub account that owns the first-party Pollinations apps. */
export const POLLINATIONS_AI_GITHUB_ID = 314960022;

const inviteFriendsQuest: QuestDefinition = {
    id: "invite_friends",
    title: "Invite friends",
    description: `Share your invite link from the bottom of this page, or let people sign up through your [app](https://gen.pollinations.ai/docs#tag/connect-user-wallets). You earn 2 Pollen for each new user who buys more than ${MIN_POLLEN_BOUGHT} Pollen.`,
    category: "grow",
    scope: "perUser",
    rewardAmount: 2,
    balanceBucket: "tier",
};

export async function listQuestCards(
    _ctx: QuestEvaluationContext,
): Promise<QuestCard[]> {
    return [questToCard(inviteFriendsQuest)];
}

export async function evaluateUser(
    { db }: QuestEvaluationContext,
    user: QuestUser,
): Promise<QuestEvaluation> {
    const referred = await db.all<{ githubId: number }>(sql`
        SELECT github_id AS githubId
        FROM "user"
        WHERE referred_by = ${user.id}
          AND github_id IS NOT NULL
          AND (COALESCE(banned, 0) = 0 OR ban_expires <= unixepoch())
          AND ${pollenBoughtSql(sql`"user".id`)} > ${MIN_POLLEN_BOUGHT}`);
    return {
        proposals: referred.map(({ githubId }) => ({
            quest: inviteFriendsQuest,
            userId: user.id,
            // Each referred GitHub identity pays its referrer once, ever.
            idempotencyKey: rewardKey(inviteFriendsQuest.id, githubId),
        })),
    };
}

/**
 * A new user who signs up through someone's app counts as referred by the app
 * owner. Copied onto the user row because @better-auth/api-key deletes expired
 * keys. First touch wins, only within an hour of signup, and never for the
 * owner's own account or a first-party app.
 */
export async function attributeAppSignup(
    db: QuestDb,
    userId: string,
    appKeyId: string,
): Promise<void> {
    await db.run(sql`
        UPDATE "user" SET referred_by = owner.id
        FROM apikey JOIN "user" AS owner ON owner.id = apikey.user_id
        WHERE "user".id = ${userId}
          AND apikey.id = ${appKeyId}
          AND "user".referred_by IS NULL
          AND "user".created_at > unixepoch() - 3600
          AND owner.id != "user".id
          AND COALESCE(owner.github_id, 0) != ${POLLINATIONS_AI_GITHUB_ID}`);
}
