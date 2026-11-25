/**
 * The `?ref=` tags the referral beacon counts.
 *
 * Gen builds these links through `fixLink`; Enter's frontend sends the beacon
 * and Enter's route records it. Both gates read this list instead of keeping
 * their own copy: an unlisted tag still lands on the page and still answers
 * 204, it is simply never counted, which no caller can observe.
 */
export const TRACKED_REFERRAL_REFS: readonly string[] = [
    "image",
    "text",
    "agent_low_balance_topup",
    "agent_low_balance_quests",
    "agent_key_budget",
    "agent_grant",
    "agent_quest_pollen_only",
    "agent_quest_pollen_only_quests",
    "quest_pollen_restricted",
    "sandbox_key_budget",
];
