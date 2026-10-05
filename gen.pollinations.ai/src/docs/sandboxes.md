## Sandboxes

Linux VMs from [E2B](https://e2b.dev), paid from your Pollinations wallet (alpha).

### Use a sandbox

```bash
polli sandbox create              # prints the id and sets up ssh
ssh <id>.polli                    # scp, sftp and rsync work too
polli sandbox list
polli sandbox timeout <id> 14400  # keep it running 4 hours without ssh
polli sandbox kill <id>
```

- A sandbox pauses about 10 minutes after the last ssh session ends. Your files stay, and the next `ssh` resumes it.
- To keep it running without ssh, pay for the time up front with `polli sandbox timeout <id> <seconds>`, up to 24 hours at a time. It also resumes a paused sandbox.
- The first `ssh` allows only polli's key, `~/.pollinations/ssh/id_ed25519`. On other templates than the default, it first installs `sshd`, `rsync` and `websocat` (Debian-based templates only).
- The default template, `pollinations` (2 vCPU, 2 GB), is E2B's `base` (Debian 12, Python 3.11) with Node.js 24, polli, and the coding harnesses polli connects: Claude Code, OpenCode, Pi, Hermes Agent and OpenClaw.
- It comes logged in when the key that creates it has the `keys` permission, as polli's own key does. polli inside uses a key of the sandbox's own, `polli-sandbox-<id>`, created like any other key, with polli's usual permissions. Killing the sandbox leaves the key. Your first interactive `ssh` connects each harness to Pollinations with a key of its own, `polli-harness-<harness>`.
- `polli sandbox create <template>` starts another E2B template instead, such as `claude` (Claude Code), `codex`, `opencode` or `amp` (2 vCPU, 2 GB each), or [any public one](https://docs.e2b.dev/use-cases/coding-agents). Bigger templates cost more per second.
- `polli sandbox logs <id>` shows the sandbox's system log: when it started and paused, and each process run in it.
- Needs Node.js 22 or newer.

### Prepared templates

Templates can include preinstalled packages, so each new sandbox skips installing them. Start a public template with `polli sandbox create <template-name-or-id>`.

To prepare your own, follow [E2B's template guide](https://docs.e2b.dev/template/quickstart). Building templates requires an E2B account and key; it is not available through the Pollinations API. A private template in your E2B account is not automatically accessible through Pollinations.

### Cost and limits

- Billed at [E2B's per-second rates](https://e2b.dev/pricing) for the sandbox's CPU and memory, paid in advance: 10 minutes at creation, 10 minutes at a time while an ssh session is open, and the time you add with `polli sandbox timeout`.
- Unused time is not refunded. Pausing a sandbox early, or shortening its timeout, gives up the rest of its paid time; resuming pays again. To stop paying, let the paid time run out or kill the sandbox.
- A new sandbox needs enough balance, and enough key budget, for its first block; otherwise it is stopped with a 402.
- At most 3 sandboxes run at once per account.

### E2B SDKs

E2B's SDKs, and its CLI run directly, work unchanged. Use a Pollinations key with the `machines` permission:

```bash
export E2B_API_URL=https://gen.pollinations.ai/alpha/e2b
export E2B_API_KEY=sk_...
```

Run `polli sandbox ssh-config` once to ssh into the sandboxes they create. Auto-resume, snapshots, forks, IAM and volume mounts are not available.
