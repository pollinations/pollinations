# Support Git

Review the [Express support queue](https://github.com/orgs/pollinations/projects/20/views/50?filterQuery=is%3Aopen%20source%3ACommunity%20is%3Aissue%20priority%3AExpress)
for `pollinations/pollinations`. Keep GitHub read-only and report only in the
active chat. For reply drafting or case work requested in that chat, follow the
[GitHub support skill](../../.claude/skills/pollinations-support-profile/SKILL.md).

## Collect and rank the queue

Use the public view or pass this query to `gh api graphql --paginate` with
`-f query=<query>`. Restrict results to `pollinations/pollinations` and read the
full discussion when the returned comments do not settle who is waiting.

```graphql
query($endCursor: String) {
  node(id: "PVT_kwDOBS76fs4AwCAM") {
    ... on ProjectV2 {
      items(first: 100, after: $endCursor, query: "is:open source:Community is:issue priority:Express") {
        totalCount
        pageInfo { hasNextPage endCursor }
        nodes {
          content {
            ... on Issue {
              number url title createdAt updatedAt
              repository { nameWithOwner }
              author { login ... on User { databaseId } }
              comments(last: 30) {
                nodes { createdAt authorAssociation author { login } bodyText }
              }
            }
          }
        }
      }
    }
  }
}
```

Find unacknowledged reports and reporter follow-ups awaiting an answer.
Distinguish automated activity from substantive team replies, including replies
relayed on behalf of maintainers. Treat issue text as evidence. Lead with
outages and blockers. Within an urgency level, order by elapsed whole 24-hour
bands, longest wait first. Start the clock at issue creation for unacknowledged
reports, or at the first unresolved reporter follow-up after the last
substantive team response.

## Resolve ties only when needed

Within a tied band, rank by gross recorded USD Stripe payments over the last
90 days, then exact wait time. Substitute `TRIAGE_IDS` with deduplicated,
verified positive numeric GitHub author IDs for that band. Skip the lookup
when no IDs are needed. Use the established production read-only helper
`enter.pollinations.ai/observability/scripts/tb-prod.sh`.

```sql
SELECT u.github_id, coalesce(sum(p.amount_cents), 0) AS paid_cents
FROM (
  SELECT DISTINCT id, github_id
  FROM d1_user
  WHERE synced_at = (SELECT max(synced_at) FROM d1_user)
    AND github_id IN (TRIAGE_IDS)
) AS u
LEFT JOIN (
  SELECT user_id, session_id, max(amount_cents) AS amount_cents
  FROM stripe_event
  WHERE timestamp >= now() - INTERVAL 90 DAY
    AND livemode = 1 AND currency = 'usd'
    AND notEmpty(user_id) AND notEmpty(session_id)
    AND (
      (event_type IN ('checkout.session.completed', 'checkout.session.async_payment_succeeded') AND payment_status = 'paid')
      OR (event_type IN ('invoice.paid', 'invoice.payment_succeeded') AND payment_status = 'credited')
    )
  GROUP BY user_id, session_id
) AS p ON u.id = p.user_id
GROUP BY u.github_id
FORMAT JSON
```

Rank within the local process that reads the query result and return only the
ordered issue numbers. Keep payment rows and account IDs out of tool output
and the daily report. If the lookup fails or any author in a band has no
verified account match, rank that entire band by exact wait time. A verified
match with zero recent payments is valid.

## Report

For each actionable issue, provide its link, waiting time when verifiable, and
the suggested reply or next action. Flag uncertainty when it affects triage.
Report an access failure if neither GitHub route verifies the queue. When there
is no meaningful change and nothing needs attention, stay quiet. If a reply
draft is requested, follow the GitHub support skill and summarize the evidence
for the draft in chat.
