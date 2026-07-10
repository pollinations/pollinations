# OpenRouter Connector Guide

Canonical vendor: `openrouter`

Use when:

- collecting OpenRouter activity/cost evidence
- reconciling OpenRouter grant-funded inference usage

Primary evidence sources:

- API: `GET https://openrouter.ai/api/v1/activity`
- Dashboard: activity and credit/grant pages for older months or grant context.

Known traps:

- Use the management API key. Runtime keys cannot read activity.
- The activity endpoint only reaches back a limited recent window, roughly 30 days.
- Do not emit a completed-month total from a truncated API window. Use dashboard/manual evidence for older completed months.
- OpenRouter usage has been grant/credit-funded locally; do not force a cash transaction match unless separate payment evidence exists.

Expected entry:

- `cost_category`: `model`
- `op_cloud_type`: `inference`
- `op_transaction_category`: `null` for activity exports
- `should_match_op_transaction`: false unless separate payment evidence exists
- `should_match_op_cloud`: true
