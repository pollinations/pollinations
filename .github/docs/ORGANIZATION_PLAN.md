# Project Organization

This document defines how we organize issues and PRs across GitHub Projects. It covers labels for categorization, priority levels, and workflow statuses.

We are transitioning from using a single **Dev** project to four dedicated projects: **Support**, **Dev**, **News**, and **Tier**.

**Rule:** Every issue and PR in the pollinations repository must belong to exactly one project — no more, no less.

## Labels

GitHub labels applied to issues and PRs for categorization and filtering.

| Label           | Support Issue | Dev Issue | Dev PR | News PR | Tier Issue | Tier PR |
| --------------- | ------------- | --------- | ------ | ------- | ---------- | ------- |
| BUG             | x             | x         |        |         |            |         |
| FEATURE         | x             | x         |        |         |            |         |
| HELP            | x             |           |        |         |            |         |
| POLLEN          | x             |           |        |         |            |         |
| QUEST           |               | x         |        |         |            |         |
| TRACKING        |               | x         |        |         |            |         |
| VOTING          | x             |           |        |         |            |         |
| NEWS            |               |           |        | x       |            |         |
| EXTERNAL        |               |           | x      |         |            |         |
| TIER-SEED       |               |           |        |         | x          | x       |
| TIER-FLOWER     |               |           |        |         | x          | x       |
| TIER-INCOMPLETE |               |           |        |         | x          |         |
| TIER-REVIEW     |               |           |        |         |            | x       |
| TIER-COMPLETE   |               |           |        |         |            | x       |
| TIER-REJECTED   |               |           |        |         |            | x       |

## Priority

GitHub Projects priority field — a built-in property for ranking importance.

| Priority | Support Issue | Dev Issue | News PR |
| -------- | ------------- | --------- | ------- |
| Urgent   | x             | x         | x       |
| High     | x             | x         |         |
| Medium   | x             | x         |         |
| Low      | x             | x         |         |

## Status

GitHub Projects status field — tracks workflow state across different project views.

| Status      | Support Issue | Dev Issue | Tier Issue |
| ----------- | ------------- | --------- | ---------- |
| Backlog     |               | x         |            |
| To do       | x             | x         |            |
| In progress | x             | x         |            |
| In review   |               |           | x          |
| Done        | x             | x         | x          |
| Discarded   | x             | x         |            |

## Status (PRs)

PR state on GitHub — Draft PRs are work-in-progress; Ready for review PRs are awaiting approval.

| Status           | Dev PR | News PR | Tier PR |
| ---------------- | ------ | ------- | ------- |
| Draft            | x      |         |         |
| Ready for review | x      | x       | x       |
