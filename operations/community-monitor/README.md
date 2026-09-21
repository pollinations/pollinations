# Community model monitor

Headless coding agent that watches community models (the
`community/owner/model` endpoints registered via My Models), probes text/image models,
reads Tinybird health for every category, and helps owners diagnose failures.
Model lists filter reliability automatically; the monitor never changes visibility. Runs on the `monitoring-agents` EC2 box (ssh alias
`community-monitor`, see `operations/infrastructure/gpu/GPU_INSTANCES.md`),
not in this repo's CI. The Discord bots share that host.

## What's here vs what's live-only

Committed (source of truth — edit here, then deploy):
- `CYCLE.md` — the agent's full rulebook, re-read fresh every cycle.
- `probe.mjs` + `probe-schedule.mjs` — selective community text/image checks (see
  "Probe load" below).
- `community-monitor.service` + `loop.sh` — the deployed systemd path. Each
  cycle gets a fresh Claude process and systemd starts the next one 30 minutes
  after completion. Headless cycles cannot be remote-controlled; a separate
  persistent `claude --remote-control community-monitor` session runs alongside
  as a phone-accessible console.
- `.claude/settings.json` — project-scoped Claude Code settings. It fixes the
  auto-compaction calculation window at 300,000 tokens for both headless cycles
  and the remote-control session launched from the monitor directory.
- `update-from-repo.sh` — before each cycle, fetches `origin/main` and atomically
  refreshes only the committed prompt/runtime files. It does not activate until
  the updater itself exists on `main`, so deploying an open PR cannot downgrade
  the live monitor.
- `healthcheck.sh` — hourly service/state-progress snapshot for external alerting.
- `.env.example` — the required env var names, no values.

Live-only on the box, never committed:
- `.env` — real `POLLI_TOKEN`, `TB_TOKEN`, and `DISCORD_TOKEN` secrets.
  Configure `mcp-discord` without `--config`; it inherits `DISCORD_TOKEN` from
  the service environment. Never place the token in MCP command-line arguments.
- `state.json` — cycle-to-cycle memory (last-replied message ids, alert state,
  probe backoff and billing flags). Preserve it during deployments to retain cooldowns and
  prevent duplicate posts.
- `people_mapping.json` — GitHub↔Discord identity map the agent maintains
  for tagging owners correctly. Contains real Discord user IDs, so it stays
  off git; the agent both reads and appends to it in place on the box.
- `probe-results.json`, `loop.log` — generated output.

## Provisioning / reproducing the box

Current box: `monitoring-agents` in AWS account `myceli-prod`, `us-east-1`,
`t4g.medium` (arm64), Elastic IP `3.221.108.127`, Ubuntu 24.04, Node 22,
`@anthropic-ai/claude-code` installed globally via npm, `gh` + `screen`.
Every new instance gets a persisted swapfile at least the size of RAM.

Use a monitor-specific SSH key and the infrastructure secret manager; do not
commit private keys or host credentials to this repository, even encrypted.
Install Node and the `claude` CLI, clone/copy this directory, populate `.env`
(see `.env.example`), install `community-monitor.service`, then run
`systemctl enable --now community-monitor`.

Moving credentials requires the separate, scoped approval in AGENTS.md's
Secret Mutation Safety rules. Only after that approval, `rsync -a` the whole
`/home/ubuntu` (this carries
`~/.claude/` — credentials, session transcripts, and the agent's memory —
plus `.env`, `state.json`, and `people_mapping.json`), copy the systemd unit
and crontab, stop the old service and screen session, then on the new host
`systemctl enable --now community-monitor` and relaunch the console with
`screen -dmS rc-console bash -lc 'cd /home/ubuntu/monitor && set -a && source .env && set +a && exec claude --resume <session-id> --remote-control community-monitor --dangerously-skip-permissions'`.
Pick "Resume full session" at the prompt to keep the session state intact.

## Automatic prompt/runtime updates

Once `update-from-repo.sh` and its systemd unit are installed, every fresh cycle
fetches `origin/main` and updates `CYCLE.md`, `.claude/settings.json`,
`probe.mjs`, `loop.sh`, `healthcheck.sh`, both leaderboard builders, and the
updater itself. Changes merged to `main` apply on the next cycle. `.env`, state,
identity mappings, logs, and generated data are never copied or removed.
Restart the service to apply a merged change immediately. Changes to the
systemd unit itself still require the deployment command below.

Do not install PR-specific prompt overrides. In particular, a systemd drop-in
that copies a frozen `CYCLE.md` after `update-from-repo.sh` defeats automatic
updates even when `.source-revision` reports current `main`. Check
`systemctl show community-monitor -p ExecStartPre` and compare the live prompt
with `operations/community-monitor/CYCLE.md` at the recorded revision after
deployment. Back up and remove obsolete overrides, then reload systemd.

`CYCLE.md` takes precedence over Claude auto-memory and `state.json` narratives.
Archive superseded policy notes outside the active memory directory; preserve
unrelated notes, health counters, and cooldowns. Terminal `usage_missing` errors
are failed requests, not informational billing flags. Investigate whether the
provider or a shared gateway change caused them before attributing an outage.

### One-time `apps/operation` to `operations` migration

Before merging the repository-root move, seed its transition-aware updater on
the monitor box:

```bash
scp operations/community-monitor/update-from-repo.sh \
  community-monitor:/home/ubuntu/monitor/update-from-repo.sh
ssh community-monitor "chmod +x /home/ubuntu/monitor/update-from-repo.sh && \
  /home/ubuntu/monitor/update-from-repo.sh"
```

Before the merge it continues reading `apps/operation/community-monitor` from
`main`. After the merge it switches to `operations/community-monitor` and keeps
itself current. Perform this handoff before merging; the previously installed
updater knows only the legacy path and cannot migrate itself.

## Deploying runtime changes

Run from the merged `main` revision. Never deploy an unmerged prompt snapshot.
When a change adds an imported helper, install that helper before `probe.mjs`
and refresh `update-from-repo.sh` before restarting the service so the next
cycle knows the complete file set.

```bash
scp operations/community-monitor/{CYCLE.md,chat-stream.mjs,image-probe.mjs,probe-schedule.mjs,probe.mjs,loop.sh,healthcheck.sh,update-from-repo.sh} \
  community-monitor:/home/ubuntu/monitor/
ssh community-monitor "mkdir -p /home/ubuntu/monitor/.claude"
scp operations/community-monitor/.claude/settings.json \
  community-monitor:/home/ubuntu/monitor/.claude/settings.json
scp operations/community-monitor/leaderboard/{build-leaderboard.mjs,build-image-leaderboard.mjs,fonts-embedded.css} \
  community-monitor:/home/ubuntu/monitor/leaderboard/
scp operations/community-monitor/community-monitor.service \
  community-monitor:/tmp/community-monitor.service
ssh community-monitor "sudo install -m 0644 /tmp/community-monitor.service \
  /etc/systemd/system/community-monitor.service && \
  chmod +x /home/ubuntu/monitor/{probe.mjs,loop.sh,healthcheck.sh,update-from-repo.sh} && \
  sudo systemctl daemon-reload && \
  sudo systemctl restart community-monitor"
```

## Probe load

`probe.mjs` fetches live pricing and modality metadata from the public,
unauthenticated `GET https://gen.pollinations.ai/models?reliability=all` catalog (no
D1/wrangler access needed on the box):

- The agent selects low-traffic, unhealthy, reported, or automatically filtered models
  using customer traffic (excluding owner/probe traffic), then runs
  `node probe.mjs --models-file /home/ubuntu/monitor/probe-candidates.json`.
  An empty selection runs no probes. Healthy busy models are skipped. Both
  text and image checks have a four-hour base interval; successive failures
  double it to at most seven days (`min(4 * 2^failures, 168)` hours).
  Success, including a fallback rescue, resets it to four hours. The script
  stores cadence in `state.json`'s `spend.probes`, separately from health
  decisions. A failed check slows retries; it does not classify the provider.
  The agent's 30-minute wake-up/reply schedule is unchanged.
- Selected, due text models get one cache-busted streaming chat request.
  Text probes omit `max_tokens` so reasoning models can
  finish, and pass only when the unique marker appears in final completion
  content inside a valid OpenAI-compatible SSE stream. Malformed JSON events,
  missing or unterminated `[DONE]`, and post-terminal data fail the probe.
  Coverage matters more than synthetic volume;
  additional requests can consume a meaningful share of low-capacity provider
  quotas and make a sweep outlive the monitor cycle.
- Selected, due image models get one image request. Models advertising `image` in
  `input_modalities` alternate `/v1/images/edits` and `/v1/images/generations`,
  starting with edits; the others test generation only. Edits send an embedded
  512px PNG, avoiding external fixture hosts. Both use a cache-busted prompt,
  default output dimensions, and `b64_json` validation. A newly listed model
  is tested immediately. Use
  `node probe.mjs --model '<community/owner/name>'` for an explicit freshness check; this
  bypasses the cadence but still sends only one request. Reserve this for a
  specific new report or fix, never routine confirmations. Targeted checks print
  JSON without replacing routine results, but update the same cadence state.
  Image freshness checks default to generation; add `--operation edit` to test
  edits (and `--category image` for a hidden exact ID). Results include the
  public `requestPath`, timestamp, and request ID when returned. Match the
  failing operation when diagnosing an issue; generation success
  cannot establish edit health. Image output alone does not prove edit quality.
- Text and image results record `modelUsed` and `fallbackUsed` from the
  gateway's served-model header. A passing fallback is effective listing health,
  not proof the primary works. Missing headers leave attribution unknown.
  Text and image failures include `upstreamStatus`, `errorCode`, and a short error
  message when available, without copying the raw upstream body. Upstream 4xx still need
  caller/provider attribution; report unnormalized provider failures as gateway
  bugs rather than inventing a second visibility rule.
- Actual spend is reconciled from each response's real `usage` tokens (not
  the pre-flight estimate) and written to `state.json`'s `spend` key.

Provider feedback stays request-driven: use public examples and aggregate
metrics, reproduce the reported operation, and verify tool/caching claims
with bounded tests. Never disclose private prompts or upstream URLs. Existing
message limits and cooldowns remain unchanged.

## Model/effort

The deployed agent is pinned to `claude-opus-4-8` at medium effort in
`loop.sh`. Every cycle starts with a fresh context containing the complete
current `CYCLE.md`. Medium effort is intentional: routine checks are
mechanical, but owner replies and billing diagnostics require controlled
comparisons and careful interpretation.

`CLAUDE_CODE_AUTO_COMPACT_WINDOW=300000` is committed in
`.claude/settings.json`. This is Claude Code's effective context capacity for
auto-compaction calculations, not a model output-token limit. Project scope is
intentional: it applies reproducibly to the headless service and the persistent
remote-control session without modifying the machine's personal settings.

Codex 5.6 Sol at medium effort is the preferred replacement once the EC2 box
has its own non-personal Codex authentication. Do not copy a maintainer's local
Codex credentials onto the shared server. Until that service credential is
available, keep the Opus medium-effort runtime rather than silently leaving the
monitor offline.

## Visibility and authority

All model-list endpoints use one rule: more than 90% success across the latest
50 eligible final requests within seven days. No minimum sample. No observations
or unavailable analytics means unknown and visible. Successful fallbacks count
for the requested model. Final 4xx and community-owner traffic are excluded;
monitor probes count. The bounded Tinybird query is `model_catalog_health.pipe`.
Health data is edge-cached for 60 seconds. `reliability=all` (or the
`Pollinations-Model-Reliability: all` header) bypasses only this filter.

This is discovery only: exact-ID calls and fallback targets remain available.
Manual hiding, privacy, key permissions and paid access remain unchanged.
No stored health flag, daily audit, hide/relist writes or recovery streaks.
The monitor retains diagnostics, billing/protocol warnings, served-model and
fallback notices, official-model alerts and daily leaderboards. It posts at most
two messages per cycle, with no routine listing-transition chatter.

## Coordinated rollout

The EC2 updater follows main while gateway deployments follow production.
Do not merge and let an old live updater try to install the removed audit script.

1. Pause `community-monitor.service` before merging this PR. Preserve state,
   credentials and cooldowns. Do not run the old policy during the cutover.
2. Validate and deploy Tinybird to staging first, verify the new pipe and public
   read-token access, then deploy to production when approved (see the Tinybird
   deployment skill). Benchmark the seven-day scan before enabling it in prod.
3. Promote/deploy Gen and Enter through the normal production GitHub Actions
   workflow. Verify default and `reliability=all` catalogs, exact-ID calls and
   fallback routing. Missing analytics fails open; it does not validate rollout.
4. Back up rows with `hidden_by = 'monitor'`, then clear only those old automatic
   hides in D1. Leave owner/admin hides and publication/privacy state unchanged:
   `UPDATE community_endpoint SET hidden_at = NULL, hidden_reason = NULL, hidden_by = NULL, updated_at = unixepoch() WHERE hidden_by = 'monitor';`
   Read back the affected rows and verify both catalog modes after registry-cache
   expiry. This is a one-time maintainer action, never a monitor duty.
5. Install the merged updater and runtime files using the commands above before
   restarting the service. The old updater still names the deleted audit script,
   so it cannot bootstrap this change itself. Archive the obsolete live audit
   script and its output; preserve state but ignore old recovery/audit keys.
   Check the live prompt/revision and one full cycle. No model-state writes,
   selective probes, and the unchanged 30-minute wake-up should be observed.
