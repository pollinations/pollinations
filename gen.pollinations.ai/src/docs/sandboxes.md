## Sandboxes

Linux VMs from [E2B](https://e2b.dev), paid from your Pollinations wallet (alpha).

### Use a sandbox

```bash
polli sandbox create              # prints the id and sets up ssh
polli sandbox create --timeout 0  # runs until you pause or kill it
ssh <id>.polli                    # scp, sftp and rsync work too
polli sandbox list
polli sandbox timeout <id> 14400  # keep it running 4 hours without ssh
polli sandbox pause <id>
polli sandbox kill <id>
```

- A sandbox pauses about 10 minutes after the last ssh session ends. Your files stay, and the next `ssh` resumes it.
- To keep it running without ssh, give it a timeout: `polli sandbox create --timeout <seconds>`, or `polli sandbox timeout <id> <seconds>`, which also resumes a paused sandbox. A timeout of 0 never expires, as Daytona's `autoStopInterval: 0`: polli asks for E2B's largest timeout, about 68 years.
- E2B's own limit is 24 hours; with a longer timeout, gen keeps the sandbox running until then. Every hour, gen pays for the next hour with the key that set the timeout. The keep ends when that key is deleted, disabled or expires, or when its budget or the wallet runs out; the sandbox then pauses when its paid hour ends. For a sandbox that should run for weeks, set its timeout with a key that has no expiry date or budget.
- E2B ends a run after 24 hours, so once a day gen pauses and resumes a kept sandbox. Its files, memory and processes stay; open connections drop. If a renewal is missed and the sandbox pauses, gen resumes it at the next renewal, within 10 minutes.
- `polli sandbox pause <id>` pauses it with its files and memory, ending a timeout over 24 hours, until `ssh` or `polli sandbox timeout` resumes it. `polli sandbox kill <id>` deletes it.
- The first `ssh` allows only polli's key, `~/.pollinations/ssh/id_ed25519`. On other templates than the default, it first installs `sshd`, `rsync` and `websocat` (Debian-based templates only).
- The default template, `pollinations` (2 vCPU, 2 GB), is E2B's `base` (Debian 12, Python 3.11) with Node.js 24, polli, and the coding harnesses polli connects: Claude Code, OpenCode, Pi, Hermes Agent and OpenClaw.
- It comes logged in when the key that creates it has the `keys` permission, as polli's own key does. polli inside uses a key of the sandbox's own, `polli-sandbox-<id>`, created like any other key, with polli's usual permissions. Killing the sandbox leaves the key. Your first interactive `ssh` connects each harness to Pollinations with a key of its own, `polli-harness-<harness>`.
- `polli sandbox create <template>` starts another E2B template instead, such as `claude` (Claude Code), `codex`, `opencode` or `amp` (2 vCPU, 2 GB each), or [any public one](https://docs.e2b.dev/use-cases/coding-agents). Bigger templates cost more per second.
- `polli sandbox logs <id>` shows the sandbox's system log: when it started and paused, and each process run in it.
- Needs Node.js 22 or newer.

### Cost and limits

- Billed at [E2B's per-second rates](https://e2b.dev/pricing) for the sandbox's CPU and memory, paid in advance: 10 minutes at creation, 10 minutes at a time while an ssh session is open, an hour at a time for a kept sandbox, and the time you add with `polli sandbox timeout`.
- Unused time is not refunded. Pausing a sandbox early, or shortening its timeout, gives up the rest of its paid time; resuming pays again. To stop paying, let the paid time run out or kill the sandbox.
- A new sandbox needs enough balance, and enough key budget, for its first block; otherwise it is stopped with a 402.
- At most 3 sandboxes run at once per account.

### E2B SDKs

E2B's SDKs, and its CLI run directly, work unchanged. Use a Pollinations key with the `machines` permission:

```bash
export E2B_API_URL=https://gen.pollinations.ai/alpha/e2b
export E2B_API_KEY=sk_...
```

Run `polli sandbox ssh-config` once to ssh into the sandboxes they create. A timeout over 24 hours, set with a key when you create, connect to or `setTimeout` a sandbox, keeps it running until then, as on an E2B team with a longer limit: gen renews it an hour at a time with that key and restarts its run once a day. E2B has no timeout that never expires; use its largest, 2147483647 seconds. A later `setTimeout` of 24 hours or less, or a pause, ends the keep. Set `lifecycle: { onTimeout: "pause" }` so a lease that goes unpaid pauses the sandbox instead of killing it. Auto-resume, snapshots, forks, IAM and volume mounts are not available.
