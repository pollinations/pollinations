import { rewards, stripeCheckoutCredits } from "@shared/db/better-auth.ts";
import { count, eq, sum } from "drizzle-orm";
import type { QuestDb } from "./quests/types.ts";
import { registrableDomain } from "./setup-reward-signups.ts";

/**
 * Setup reward holds live in the SETUP_HOLDS KV store, shared with
 * infra-watch:
 *   hold:<domain>    "held" by infra-watch after a sign-up burst on the
 *                    domain while holds are on; "released" by a maintainer.
 *   review:<userId>  "pending", with the account's evidence as metadata,
 *                    once the account asks for a review. A maintainer
 *                    replaces it with "approved" or "declined", which drops
 *                    the metadata.
 * An account is held while its email domain is held, it has bought no pollen
 * pack and its review isn't approved.
 */
export type SetupHold = { review: "pending" | "declined" | null };

type HoldEnv = { SETUP_HOLDS: KVNamespace };
type HoldUser = { id: string; email: string; createdAt: Date };

/** The account's hold, or null when its Setup rewards can be claimed. */
export async function setupHold(
    env: HoldEnv,
    db: QuestDb,
    user: Pick<HoldUser, "id" | "email">,
): Promise<SetupHold | null> {
    const domain = registrableDomain(user.email);
    if (!domain) return null;
    const [hold, review, purchases] = await Promise.all([
        env.SETUP_HOLDS.get(`hold:${domain}`),
        env.SETUP_HOLDS.get(`review:${user.id}`),
        db
            .select({ id: stripeCheckoutCredits.sessionId })
            .from(stripeCheckoutCredits)
            .where(eq(stripeCheckoutCredits.userId, user.id))
            .limit(1),
    ]);
    if (hold !== "held" || review === "approved" || purchases.length > 0)
        return null;
    return {
        review: review === "pending" || review === "declined" ? review : null,
    };
}

/**
 * Asks for a review, once per account. The metadata is what infra-watch's
 * review reads: written here, never by the user.
 */
export async function requestSetupReview(
    env: HoldEnv,
    db: QuestDb,
    user: HoldUser,
): Promise<SetupHold | null> {
    const hold = await setupHold(env, db, user);
    if (!hold || hold.review) return hold;
    const [earned] = await db
        .select({ rewards: count(), pollen: sum(rewards.pollenAmount) })
        .from(rewards)
        .where(eq(rewards.userId, user.id));
    await env.SETUP_HOLDS.put(`review:${user.id}`, "pending", {
        metadata: {
            domain: registrableDomain(user.email),
            requestedAt: Date.now(),
            createdAt: user.createdAt.getTime(),
            rewards: earned?.rewards ?? 0,
            rewardPollen: Number(earned?.pollen ?? 0),
        },
    });
    return { review: "pending" };
}
