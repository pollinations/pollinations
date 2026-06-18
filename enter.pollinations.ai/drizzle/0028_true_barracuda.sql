UPDATE reward_grants
SET
    quest_id = 'github:community_issue_quest',
    source_ref = (
        SELECT 'pr:' || quest_payout_credits.pr_number
        FROM quest_payout_credits
        WHERE quest_payout_credits.payout_key = reward_grants.idempotency_key
    ),
    metadata_json = (
        SELECT json_object(
            'questTypeId', 'github:community_issue_quest',
            'issueNumber', quest_payout_credits.quest_issue_number,
            'prNumber', quest_payout_credits.pr_number,
            'role', quest_payout_credits.role,
            'githubUsername', quest_payout_credits.github_username
        )
        FROM quest_payout_credits
        WHERE quest_payout_credits.payout_key = reward_grants.idempotency_key
    )
WHERE source = 'code_quest'
  AND EXISTS (
      SELECT 1
      FROM quest_payout_credits
      WHERE quest_payout_credits.payout_key = reward_grants.idempotency_key
  );
--> statement-breakpoint
INSERT OR IGNORE INTO reward_grants (
    id,
    idempotency_key,
    user_id,
    source,
    quest_id,
    pollen_credited,
    balance_bucket,
    source_ref,
    metadata_json,
    created_at
)
SELECT
    'backfill:' || payout_key,
    payout_key,
    user_id,
    'code_quest',
    'github:community_issue_quest',
    pollen_credited,
    'pack',
    'pr:' || pr_number,
    json_object(
        'questTypeId', 'github:community_issue_quest',
        'issueNumber', quest_issue_number,
        'prNumber', pr_number,
        'role', role,
        'githubUsername', github_username
    ),
    created_at
FROM quest_payout_credits
WHERE NOT EXISTS (
    SELECT 1
    FROM reward_grants
    WHERE reward_grants.idempotency_key = quest_payout_credits.payout_key
);
--> statement-breakpoint
DROP TABLE `quest_payout_credits`;
