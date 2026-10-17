# Sandbox reference

Start with the [Sandboxes guide](https://gen.pollinations.ai/docs#tag/sandboxes) for setup, lifecycle and billing.

## SSH and connection troubleshooting

- A sandbox pauses 15 to 20 minutes after the last ssh session ends. Your files stay, and the next `ssh` resumes it. ssh keeps the connection 10 of those minutes, so the next `ssh`, `scp` or `rsync` starts in under a second; `ssh -O exit <id>.polli` closes it sooner. Where ssh can't share a connection, on Windows or with a home folder path over 34 characters, it pauses 5 to 10 minutes after.
- When ssh can't reach a sandbox, it prints why, such as a sandbox that doesn't exist or too many running. VS Code only says the connection closed; run `ssh <id>.polli` in a terminal to see why.
- Port forwarding works (`-L`, `-R`, `-D`), and VS Code's Remote-SSH connects to `<id>.polli` like any host. An open connection, including VS Code, keeps the sandbox running and consuming credits. See the [current rates](https://gen.pollinations.ai/alpha/e2b/pricing).

## Runtime and renewal

- To keep it running without ssh, give it a timeout: `polli sandbox create --timeout <seconds>`, or `polli sandbox timeout <id> <seconds>`, which also resumes a paused sandbox. A timeout of 0 keeps it running until you pause or delete it, subject to balance and key permissions.
- With a timeout longer than 10 minutes, gen keeps the sandbox running until then, 10 minutes at a time: every 5 minutes it pays to bring the paid time back up to 10 minutes, with the key that set the timeout, or from your account when you set it on the dashboard. The keep ends when that key is deleted, disabled or expires, or when its budget or the wallet runs out; the sandbox then pauses when its paid time ends. For long-running work, give the key enough budget and an expiry that covers the intended duration.
- E2B ends a run after 24 hours, so once a day gen pauses and resumes a kept sandbox. Its files, memory and processes stay; open connections drop. If a renewal is missed and the sandbox pauses, gen resumes it at the next renewal, within 5 minutes.
- `polli sandbox pause <id>` pauses it with its files and memory, ending its scheduled runtime, until `ssh` or `polli sandbox timeout` resumes it. `polli sandbox kill <id>` deletes it.

## Templates and credentials

- The first `ssh` allows only polli's key, `~/.pollinations/ssh/id_ed25519`. On other templates than the default, it first installs `sshd`, `rsync` and `websocat` (Debian-based templates only).
- The default template, `pollinations` (2 vCPU, 2 GB memory, 20 GB free disk), is E2B's `base` (Debian 12, Python 3.11) with Node.js 24, polli, and the coding harnesses polli connects: Claude Code, OpenCode, Pi and OpenClaw. `pollinations-large` is the same with 4 vCPU, 8 GB memory and 50 GB free disk, for builds, test suites and media that need more.
- Both come logged in when the key that creates it has the `keys` permission, as polli's own key does. polli inside uses a key of the sandbox's own, `polli-sandbox-<id>`, created like any other key, with polli's usual permissions except `keys`, so code in the sandbox can't create keys or change budgets. Killing the sandbox leaves the key. Your first interactive `ssh` connects each harness to Pollinations with that same key.

## Tools and storage

- Both also run a [herdr](https://herdr.dev) server, started by `ssh`. Agents you start in `herdr` keep running after ssh disconnects, and a paused sandbox resumes them where they were. `ssh <id>.polli herdr agent list` shows them and their state; `herdr machine add <id>.polli` lets herdr on your own machine manage them.
- Both include everyday tools: ffmpeg, ImageMagick, git-lfs, [uv](https://docs.astral.sh/uv/), ripgrep, fd, jq, sqlite3, tmux, pdftotext, `gh`, gcc and make.
- cron runs in every sandbox, but only while the sandbox runs, so keep it running with `--timeout 0` for jobs around the clock. A paused sandbox runs nothing, and `@reboot` never fires, since sandboxes resume instead of booting. Your crontab starts with a `PATH` line that finds node, polli and uv; keep it when you replace the crontab.
- Both include [rclone](https://rclone.org) to mount a bucket as a folder, for big files that should outlive the sandbox: set it up once with `rclone config` (S3, R2, Google Cloud Storage and others), then `mkdir ~/bucket && rclone mount <remote>:<bucket> ~/bucket --daemon --vfs-cache-mode full`. The mount stays through pause and resume. Buckets are slow with many small files, so keep git repos, `node_modules` and databases on the sandbox's own disk, which `kill` deletes.

## Custom templates and logs

- `polli sandbox create <template>` starts another E2B template instead, such as `claude` (Claude Code), `codex`, `opencode` or `amp` (2 vCPU, 2 GB each), or [any public one](https://docs.e2b.dev/use-cases/coding-agents). Bigger templates cost more per second. To preinstall your own packages, build a template in your own E2B account with [E2B's template guide](https://docs.e2b.dev/template/quickstart), [publish it](https://docs.e2b.dev/faq/public-templates), and start it as `polli sandbox create <project-slug>/<template-name>`.
- A sandbox's name is its E2B `metadata.name`, set at creation: the dashboard suggests one such as `brave-otter`, and API callers pass `"metadata": {"name": "…"}`. `polli sandbox list` shows it. E2B can't change metadata later, so a name stays as created.
- `polli sandbox logs <id>` shows the sandbox's system log: when it started and paused, and each process run in it.

## E2B SDKs

E2B's SDKs, and its CLI run directly, work unchanged. Use a Pollinations key with the `machines` permission:

```bash
export E2B_API_URL=https://gen.pollinations.ai/alpha/e2b
export E2B_API_KEY=sk_...
```

Run `polli sandbox ssh-config` once to ssh into the sandboxes they create. A timeout longer than 10 minutes, set when you create, connect to or `setTimeout` a sandbox, keeps it running until then, past E2B's 24-hour run too: gen renews it 10 minutes at a time with that key and restarts its run once a day. Its `endAt` shows when the timeout ends, as on E2B. E2B has no timeout that never expires; use its largest, 2147483647 seconds. A later `setTimeout` of 10 minutes or less, or a pause, ends the keep. A lease that runs out, or goes unpaid, pauses the sandbox; set `lifecycle: { onTimeout: "kill" }` to have it deleted instead. Auto-resume, snapshots, forks, IAM and volume mounts are not available.
