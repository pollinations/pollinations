import type { D1Database } from "@cloudflare/workers-types";
import { COMMUNITY_MODEL_ALLOWED_GITHUB_IDS } from "../../shared/auth/github-id-list";
import {
    CODE_AGENT_BASE_URL_PLACEHOLDER,
    CodeAgentConfigSchema,
} from "../../shared/community-endpoints";
import { localIdentity, USER_ID } from "./fixtures";

export const reviewSetupOptions = {
    device: ["pending", "expired", "used", "missing-app"],
    dashboard: ["populated", "empty"],
    listing: ["hidden", "queued", "endpoint-agent", "code-agent", "public"],
    billing: ["ready", "enabled", "payment-action"],
    connections: ["available", "connected"],
    activity: ["available", "empty"],
    discord: ["connected", "unavailable"],
    endpoint: ["success"],
    payment: ["credited", "failed"],
    rewards: ["empty", "available", "claimed"],
} as const;
export type ReviewSetup = {
    [K in keyof typeof reviewSetupOptions]?: (typeof reviewSetupOptions)[K][number];
};
export function parseReviewSetup(value: unknown): ReviewSetup {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("Invalid review setup");
    for (const [key, choice] of Object.entries(value)) {
        if (
            !Object.hasOwn(reviewSetupOptions, key) ||
            !(
                reviewSetupOptions[
                    key as keyof ReviewSetup
                ] as readonly unknown[]
            ).includes(choice)
        )
            throw new Error("Invalid review setup");
    }
    return value;
}

// Only metadata in Flow's isolated database. No credentials or UI markup.
export async function prepareReviewData(db: D1Database, setup: ReviewSetup) {
    const now = Math.floor(Date.now() / 1000);
    // Clear only earlier review metadata when selecting another case in Journey.
    await db.batch([
        db
            .prepare(
                "UPDATE user SET pack_balance = MAX(0, pack_balance - COALESCE((SELECT pollen_credited FROM stripe_checkout_credits WHERE session_id = 'cs_flow_review' AND user_id = ?), 0)), tier_balance = MAX(0, tier_balance - COALESCE((SELECT pollen_amount FROM rewards WHERE id = 'flow-review-reward' AND user_id = ? AND claimed_at IS NOT NULL), 0)) WHERE id = ?",
            )
            .bind(USER_ID, USER_ID, USER_ID),
        db
            .prepare(
                "DELETE FROM rewards WHERE id = 'flow-review-reward' AND user_id = ?",
            )
            .bind(USER_ID),
        db
            .prepare(
                "UPDATE user SET github_id = ? WHERE id = ? AND github_id = ?",
            )
            .bind(
                localIdentity.id,
                USER_ID,
                COMMUNITY_MODEL_ALLOWED_GITHUB_IDS[0],
            ),
        db
            .prepare(
                "UPDATE user SET stripe_customer_id = NULL, auto_top_up_enabled = 0 WHERE id = ? AND stripe_customer_id = 'cus_flow_review'",
            )
            .bind(USER_ID),
        db
            .prepare(
                "DELETE FROM stripe_auto_top_up_attempt WHERE id = 'flow-review-attempt' AND user_id = ?",
            )
            .bind(USER_ID),
        db
            .prepare(
                "DELETE FROM stripe_checkout_credits WHERE session_id = 'cs_flow_review' AND user_id = ?",
            )
            .bind(USER_ID),
        db
            .prepare(
                "DELETE FROM account WHERE id = 'flow-review-discord' AND user_id = ?",
            )
            .bind(USER_ID),
    ]);

    // No usable provider credential: the local external-service fixture does not authenticate it.
    if (setup.discord)
        await db
            .prepare(
                "INSERT OR REPLACE INTO account (id, provider_id, account_id, user_id, access_token, created_at, updated_at) VALUES ('flow-review-discord', 'discord', '100000000000000001', ?, 'invalid-local-review-placeholder', ?, ?)",
            )
            .bind(USER_ID, now, now)
            .run();

    if (setup.listing === "public")
        await db
            .prepare("UPDATE user SET github_id = ? WHERE id = ?")
            .bind(COMMUNITY_MODEL_ALLOWED_GITHUB_IDS[0], USER_ID)
            .run();
    if (setup.billing)
        await db
            .prepare(
                "UPDATE user SET stripe_customer_id = 'cus_flow_review', auto_top_up_enabled = ?, auto_top_up_amount_usd = 5 WHERE id = ?",
            )
            .bind(
                ["enabled", "payment-action"].includes(setup.billing) ? 1 : 0,
                USER_ID,
            )
            .run();
    if (setup.billing === "payment-action")
        await db
            .prepare(
                "INSERT OR REPLACE INTO stripe_auto_top_up_attempt (id, user_id, stripe_invoice_id, amount_usd, status, created_at) VALUES ('flow-review-attempt', ?, 'in_flow_review', 5, 'pending', ?)",
            )
            .bind(USER_ID, Date.now())
            .run();

    if (setup.listing === "hidden")
        await db
            .prepare(
                "UPDATE community_endpoint SET hidden_at = ?, hidden_reason = 'owner', hidden_by = ? WHERE owner_user_id = ?",
            )
            .bind(now, USER_ID, USER_ID)
            .run();
    if (setup.listing === "queued")
        await db
            .prepare(
                "UPDATE community_endpoint SET pending_visibility = 'public', pending_payload = payload, pending_at = ? WHERE id = 'flow-review-model'",
            )
            .bind(now + 10800)
            .run();
    if (setup.listing === "endpoint-agent")
        await db
            .prepare(
                "UPDATE community_endpoint SET type = 'endpoint_agent', base_url = 'https://flow-review.invalid/v1/chat/completions', payload = '{\"api\":\"chat_completions\",\"perUserRpm\":null}' WHERE id = 'flow-review-agent'",
            )
            .run();
    if (setup.listing === "code-agent")
        await db
            .prepare(
                "UPDATE community_endpoint SET type = 'code_agent', base_url = ?, payload = ? WHERE id = 'flow-review-agent'",
            )
            .bind(
                CODE_AGENT_BASE_URL_PLACEHOLDER,
                JSON.stringify(
                    CodeAgentConfigSchema.parse({
                        repository:
                            "https://github.com/flow-review/example-agent",
                        deployedCommitSha: "0".repeat(40),
                    }),
                ),
            )
            .run();
    if (setup.payment === "credited")
        await db.batch([
            db
                .prepare(
                    "INSERT INTO stripe_checkout_credits (session_id, event_id, event_type, user_id, pollen_credited, created_at) VALUES ('cs_flow_review', 'evt_flow_review', 'checkout.session.completed', ?, 5, ?)",
                )
                .bind(USER_ID, Date.now()),
            db
                .prepare(
                    "UPDATE user SET pack_balance = pack_balance + 5 WHERE id = ?",
                )
                .bind(USER_ID),
        ]);
    if (setup.payment === "failed")
        await db
            .prepare(
                "INSERT OR REPLACE INTO stripe_auto_top_up_attempt (id, user_id, amount_usd, status, failure_reason, created_at) VALUES ('flow-review-attempt', ?, 5, 'failed', 'Your card was declined.', ?)",
            )
            .bind(USER_ID, Date.now())
            .run();
    if (setup.rewards) {
        await db
            .prepare("DELETE FROM rewards WHERE user_id = ?")
            .bind(USER_ID)
            .run();
        if (setup.rewards !== "empty")
            await db.batch([
                db
                    .prepare(
                        "INSERT INTO rewards (id, idempotency_key, user_id, title, pollen_amount, balance_bucket, earned_at, claimed_at) VALUES ('flow-review-reward', 'flow-review-reward', ?, 'Flow review reward', 5, 'tier', ?, ?)",
                    )
                    .bind(
                        USER_ID,
                        now,
                        setup.rewards === "claimed" ? now : null,
                    ),
                ...(setup.rewards === "claimed"
                    ? [
                          db
                              .prepare(
                                  "UPDATE user SET tier_balance = tier_balance + 5 WHERE id = ?",
                              )
                              .bind(USER_ID),
                      ]
                    : []),
            ]);
    }
}
