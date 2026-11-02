# Operations

Internal tools that run Pollinations, grouped by what they are for. Apps with a `deploy.json` deploy from `production` through [`deployment/`](deployment/README.md).

## Dashboards

| Folder | What it is |
| --- | --- |
| [`dashboards/economics`](dashboards/economics/) | economics.pollinations.ai: income, provider costs and balances, plus the provider list the shared tests read |
| [`dashboards/kpi`](dashboards/kpi/) | kpi.pollinations.ai: growth numbers, plus the daily GitHub stars snapshot |
| [`dashboards/model-monitor`](dashboards/model-monitor/) | model-monitor.pollinations.ai: public model health and the Trust tab |
| [`dashboards/observability`](dashboards/observability/) | observability.pollinations.ai: Grafana dashboards |
| [`dashboards/quest-dashboard`](dashboards/quest-dashboard/) | Quest payouts dashboard (Worker `quest-dash-live`) |

## Monitoring

| Folder | What it is |
| --- | --- |
| [`infra-watch`](infra-watch/) | Checks every minute and posts Discord alerts; also the daily community leaderboards and the outside heartbeat |
| [`model-evals`](model-evals/) | Weekly model quality tests whose scores feed the Trust tab |
| [`community-monitor`](community-monitor/README.md) | Retired EC2 community monitor, awaiting removal |

## Data sync

| Folder | What it is |
| --- | --- |
| [`data-sync`](data-sync/) | Scheduled jobs that copy D1, app list, Cloudflare, GitHub and Search Console data into Tinybird |

## News

| Folder | What it is |
| --- | --- |
| [`social`](social/PIPELINE.md) | News pipeline: daily, weekly and monthly posts, per-PR Discord posts and the News page data |

## App management

| Folder | What it is |
| --- | --- |
| [`app-management`](app-management/) | Community app list (`app.json`), submission reviews, screenshots, metrics and the README app table |

## Infrastructure

| Folder | What it is |
| --- | --- |
| [`infrastructure/gpu`](infrastructure/gpu/GPU_INSTANCES.md) | Image GPU servers and the live fleet list |
| [`infrastructure/cpu`](infrastructure/cpu/) | CPU host list and its encrypted secrets |
| [`infrastructure/e2b`](infrastructure/e2b/) | E2B sandbox template |
| [`infrastructure/azure-sandboxes`](infrastructure/azure-sandboxes/) | Azure sandbox image |
| [`deployment`](deployment/README.md) | Deploy scripts for every app with a `deploy.json` |
| [`github`](github/project-manager.md) | Project manager bot that sets Area and Priority on issues and PRs |
| [`mcp-registry`](mcp-registry/DIRECTORY_LISTINGS.md) | Publishes the hosted MCP servers to the official MCP registry |

## Legal

| Folder | What it is |
| --- | --- |
| [`legal`](legal/) | Draft data processing addendum, kept off the website until approved |
