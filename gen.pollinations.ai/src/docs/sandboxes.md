## Sandboxes

Linux VMs from [E2B](https://e2b.dev), paid from your Pollinations wallet (alpha).

### Use a sandbox

```bash
polli sandbox create              # prints the id and sets up ssh
polli sandbox create --timeout 0  # runs until you pause or kill it
polli sandbox create pollinations-large  # 4 vCPU, 8 GB
ssh <id>.polli                    # scp, sftp and rsync work too
polli sandbox list
polli sandbox timeout <id> 14400  # keep it running 4 hours without ssh
polli sandbox pause <id>
polli sandbox kill <id>
```

- A sandbox pauses about 10 minutes after the last ssh session ends. Your files stay, and the next `ssh` resumes it.
- To keep it running without ssh, give it a timeout: `polli sandbox create --timeout <seconds>`, or `polli sandbox timeout <id> <seconds>`, which also resumes a paused sandbox. A timeout of 0 never expires, as Daytona's `autoStopInterval: 0`: polli asks for E2B's largest timeout, about 68 years.
- With a timeout longer than 10 minutes, gen keeps the sandbox running until then, 10 minutes at a time: every 5 minutes it pays to bring the paid time back up to 10 minutes, with the key that set the timeout, or from your account when you set it on the dashboard. The keep ends when that key is deleted, disabled or expires, or when its budget or the wallet runs out; the sandbox then pauses when its paid time ends. For a sandbox that should run for weeks, set its timeout with a key that has no expiry date or budget.
- E2B ends a run after 24 hours, so once a day gen pauses and resumes a kept sandbox. Its files, memory and processes stay; open connections drop. If a renewal is missed and the sandbox pauses, gen resumes it at the next renewal, within 5 minutes.
- `polli sandbox pause <id>` pauses it with its files and memory, ending a keep, until `ssh` or `polli sandbox timeout` resumes it. `polli sandbox kill <id>` deletes it.
- The first `ssh` allows only polli's key, `~/.pollinations/ssh/id_ed25519`. On other templates than the default, it first installs `sshd`, `rsync` and `websocat` (Debian-based templates only).
- The default template, `pollinations` (2 vCPU, 2 GB), is E2B's `base` (Debian 12, Python 3.11) with Node.js 24, polli, and the coding harnesses polli connects: Claude Code, OpenCode, Pi, Hermes Agent and OpenClaw. `pollinations-large` is the same with 4 vCPU and 8 GB, for builds and test suites that need more memory.
- Both come logged in when the key that creates it has the `keys` permission, as polli's own key does. polli inside uses a key of the sandbox's own, `polli-sandbox-<id>`, created like any other key, with polli's usual permissions except `keys`, so code in the sandbox can't create keys or change budgets. Killing the sandbox leaves the key. Your first interactive `ssh` connects each harness to Pollinations with that same key.
- Both also run a [herdr](https://herdr.dev) server, started by `ssh`. Agents you start in `herdr` keep running after ssh disconnects, and a paused sandbox resumes them where they were. `ssh <id>.polli herdr agent list` shows them and their state; `herdr machine add <id>.polli` lets herdr on your own machine manage them.
- `polli sandbox create <template>` starts another E2B template instead, such as `claude` (Claude Code), `codex`, `opencode` or `amp` (2 vCPU, 2 GB each), or [any public one](https://docs.e2b.dev/use-cases/coding-agents). Bigger templates cost more per second.
- `polli sandbox logs <id>` shows the sandbox's system log: when it started and paused, and each process run in it.
- Needs Node.js 22 or newer.

### Cost and limits

- Billed per second for the sandbox's CPU and memory, at a quarter of [E2B's rates](https://e2b.dev/pricing) during the launch: about 0.033 Pollen an hour for `pollinations`, 0.083 for `pollinations-large`. Paid 10 minutes ahead: at creation, while an ssh session is open, and while a timeout keeps it running.
- Unused time is not refunded. Pausing or killing a sandbox, or shortening its timeout, gives up the rest of its paid 10 minutes; resuming pays again.
- A new sandbox needs enough balance, and enough key budget, for its first block; otherwise it is stopped with a 402.
- At most 3 sandboxes run at once per account.

### E2B SDKs

E2B's SDKs, and its CLI run directly, work unchanged. Use a Pollinations key with the `machines` permission:

```bash
export E2B_API_URL=https://gen.pollinations.ai/alpha/e2b
export E2B_API_KEY=sk_...
```

Run `polli sandbox ssh-config` once to ssh into the sandboxes they create. A timeout longer than 10 minutes, set when you create, connect to or `setTimeout` a sandbox, keeps it running until then, past E2B's 24-hour run too: gen renews it 10 minutes at a time with that key and restarts its run once a day. E2B's `endAt` then shows the end of the paid 10 minutes; gen's sandbox list adds `keptUntil`. E2B has no timeout that never expires; use its largest, 2147483647 seconds. A later `setTimeout` of 10 minutes or less, or a pause, ends the keep. Set `lifecycle: { onTimeout: "pause" }` so a lease that goes unpaid pauses the sandbox instead of killing it. Auto-resume, snapshots, forks, IAM and volume mounts are not available.
