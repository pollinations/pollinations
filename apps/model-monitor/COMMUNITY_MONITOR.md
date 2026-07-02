# Community model health monitor

Standing health monitor for community-submitted text models (`owner/model`
endpoints). Two parts:

1. **`monitor.mjs`** — probes every community model across several request
   shapes (simple, streaming, JSON, tool-call, large-coding-prompt). Run
   `node monitor.mjs` for a live local dashboard (loops every 180s), or
   `node monitor.mjs --once` for a single sweep that writes `results.json`
   and exits — this is what the EC2 loop uses.
2. **`loop.sh` + `AGENT_INSTRUCTIONS.md`** — the EC2 loop. Each cycle:
   generates fresh probe traffic (`monitor.mjs --once`), then hands off to
   **headless Claude Code** (`claude -p`) with `AGENT_INSTRUCTIONS.md` as its
   brief. Claude Code — not a hardcoded formula — reads the probe results
   plus Tinybird's `model_health`/`recent_server_errors` pipes, decides which
   models look genuinely (not transiently) unstable, investigates why, and —
   unless `MONITOR_DRY_RUN=1` — deactivates them by updating D1 directly with
   a specific reason. Dry-run cycles do not expose the Cloudflare D1 token to
   the agent. It never reactivates; that's an owner-only action through the
   dashboard save flow.

No secrets are tracked here. `.env.example` documents what's needed; the real
`.env` is gitignored.

## Local test run

```bash
cd apps/model-monitor
cp .env.example .env   # fill in real values, see comments in the file
set -a; source .env; set +a
./loop.sh
```

Leave `MONITOR_DRY_RUN=1` for any local testing — it should never actually
deactivate anything outside the reviewed EC2 soak period.

## EC2 deploy (manual — no CI/IaC yet, tracked as a fast-follow)

Reuses the existing `enter-services` box's networking (VPC
`vpc-0d37cc359b56f7d32`, subnet `subnet-0d7d5327566a75c23`, security group
`pollinations-shared-sg`, key pair `thomashkey`).

1. Provision (adjust the AMI id to the current Ubuntu 24.04 ARM64 AMI for the
   target region — don't reuse a stale hardcoded id):
   ```bash
   aws ec2 run-instances --profile admin \
     --image-id <ubuntu-24.04-arm64-ami> \
     --instance-type t4g.micro \
     --key-name thomashkey \
     --security-group-ids <sg-id-for-pollinations-shared-sg> \
     --subnet-id subnet-0d7d5327566a75c23 \
     --block-device-mappings '[{"DeviceName":"/dev/sda1","Ebs":{"VolumeSize":10,"VolumeType":"gp3"}}]' \
     --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=community-model-monitor}]'
   ```
2. SSH in, install Node + the `claude` CLI, clone the repo (or just this
   script directory), copy this folder's files.
3. Populate `.env` on the box (never commit it) — copy `.env.example`, fill
   in real values pulled via `sops -d enter.pollinations.ai/secrets/prod.vars.json`.
4. Install the systemd unit:
   ```bash
   sudo cp community-monitor.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now community-monitor
   ```
5. Interactive access, two options (both coexist):
   - `screen -r community-monitor` — attach to the live, scrollable
     transcript of the running Claude Code session (the systemd unit starts
     it detached via `screen -dmS community-monitor`, so `Restart=always`
     still recovers a killed screen while this stays available).
   - Claude Code's own `--remote-control` flag — add it to the `claude -p`
     invocation in `loop.sh` for a second, lighter-weight remote-attach path.
6. **Start in dry-run** (`MONITOR_DRY_RUN=1`, the default) and soak for a
   while against real production data before flipping to `0` — this is the
   highest-blast-radius piece of the whole feature since it can take a real
   community member's model offline.

## Required secrets (never commit)

See `.env.example` for the full list and where to pull each value from:
`ENTER_API_TOKEN`, `TINYBIRD_READ_TOKEN`, `CLOUDFLARE_API_TOKEN` for live
mode only, and Claude Code's own auth (Anthropic API key, or the
`claude-code-router` + `gen.pollinations.ai` pattern already proven in
`.github/workflows/issue-polly-auto-fix.yml`).
