# Model retirements

Run this review read-only. Follow the [model-management skill](../../.claude/skills/model-management/SKILL.md) and
its [catalog lifecycle policy](../../.claude/skills/model-management/references/operating-policy.md). Use current `origin/production`
for configured routes and `origin/main` for upcoming changes. Fetch refs if
needed and read them with Git without switching the user's checkout.

Start with open issues and PRs in the [Retirement queue](https://github.com/orgs/pollinations/projects/20/views/42?filterQuery=is%3Aopen%20area%3AModels%20model-work%3ARetirement). Check for existing work before proposing another retirement.

## Usage

Start from the live public catalog at `https://gen.pollinations.ai/models`.
Screen Pollinations-managed entries with `community=false` and an `added_date`
on or before the first of the previous 28 complete UTC days. Check that the
production Tinybird feed is fresh with
`enter.pollinations.ai/observability/scripts/tb-prod.sh --check`. Check rollup
coverage in `generation_usage_hourly` over the same window, using the same
environment and customer traffic filters below. Expect 28 UTC dates with
customer traffic in each of their 24 distinct hours. Withhold low-use conclusions
when the catalog, telemetry or coverage checks fail.

Pass this query as one argument to the established read-only `tb-prod.sh`
helper from the repo. It counts final requests by the requested model,
including customer errors and fallback rescues. Exact-response cache hits are
outside the rollup. `regular` and `legacy` are customer traffic.

```sql
WITH toStartOfDay(now('UTC')) AS window_end
SELECT model,
       sumMergeIf(all_calls, traffic_group IN ('regular','legacy')) AS requests,
       sumMergeIf(all_calls, traffic_group IN ('regular','legacy') AND hour >= window_end - INTERVAL 7 DAY) AS recent,
       sumMergeIf(successful_calls, traffic_group IN ('regular','legacy')) AS successes,
       sumMergeIf(billed_calls, traffic_group IN ('regular','legacy') AND funding_source = 'paid') AS paid,
       uniqMergeIf(users, traffic_group IN ('regular','legacy')) AS accounts,
       uniqIfMergeIf(apps, traffic_group IN ('regular','legacy')) AS byop_apps,
       sumMergeIf(all_calls, traffic_group IN ('dev','operations')) AS internal,
       maxIf(hour, traffic_group IN ('regular','legacy')) AS last_customer_hour
FROM generation_usage_hourly
WHERE environment = 'production' AND hour >= window_end - INTERVAL 28 DAY AND hour < window_end
GROUP BY model
FORMAT JSON
```

Left-join the usage to the live catalog so zero observed requests are visible.
Check Git history for renames and use canonical IDs. Roll old IDs into their
successor only when they referred to the same public model during the window.
Treat account and app totals summed across IDs as upper bounds. Hold candidates
with ambiguous identity or missing telemetry.

Flag models with fewer than **100 requests** for review. Prioritize those with
zero requests in the final seven days. Report the 28-day and seven-day counts,
last observed activity, successes, paid calls, approximate account and Bring
Your Own Pollen app counts, and internal usage. Check whether failures explain
low usage. Investigate paid or active integration use, cache and alias ambiguity,
specialized capabilities, defaults, first-party callers, use as a fallback and
known API-key allowlist dependencies before recommending removal.

## Provider cutoffs and next steps

Check for upstream shutdowns within 60 days and past-due routes still
configured. Start with the production registry route notes, official provider
lifecycle notices and tracked GitHub issues and PRs, including open
`MERGE-HOLD` PRs. Verify the date and exact deployment or checkpoint. Compare
primary and fallback routes with main and open work. Flag deadlines without a
verified plan regardless of demand. Prefer preserving the public ID when an
equivalent route is available.

For voluntary retirement, propose the canonical ID, affected aliases and
integrations, usage and rationale, compatible replacement or gaps, and a date
at least 30 days after customer notice. A maintainer approves the specific
model change. Track it through the existing announcement and dated
`MERGE-HOLD` PR process, recheck usage, dependencies and the replacement
before lifting the hold, and verify the catalog and affected routes after the
normal production deployment.

Keep the scheduled report and draft plans in the active chat. Public notices,
GitHub writes, registry or permission changes and deployment need separately
authorized follow-up. Keep individual account identities out of the report.
Report actionable changes, upcoming deadlines and data failures. Keep an
unchanged update to one line.
