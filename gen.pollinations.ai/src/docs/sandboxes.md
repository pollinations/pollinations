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
- To keep it running without ssh, pay for the time up front with `polli sandbox create --timeout <seconds>` or `polli sandbox timeout <id> <seconds>`, up to 24 hours at a time.
- The first `ssh` installs `sshd`, `rsync` and `websocat` in the sandbox (Debian-based templates) and allows only polli's key, `~/.pollinations/ssh/id_ed25519`.
- `polli sandbox create <template>` starts another E2B template, for example `claude`.
- Needs Node.js 22 or newer.
- [My Models](https://enter.pollinations.ai/my-models) in the dashboard also lists, creates and kills sandboxes.

### Cost and limits

- Billed at [E2B's per-second rates](https://e2b.dev/pricing) for the sandbox's CPU and memory, paid in advance: the timeout you set, then 10 minutes at a time while an ssh session is open.
- Pausing and resuming within paid time is free. Unused time is not refunded.
- A new sandbox needs enough balance, and enough key budget, for its first block; otherwise it is stopped with a 402.
- At most 3 sandboxes run at once per account.

### E2B CLI and SDKs

E2B's own CLI and SDKs work unchanged. Use a Pollinations key with the `machines` permission:

```bash
export E2B_API_URL=https://gen.pollinations.ai/alpha/e2b
export E2B_API_KEY=sk_...
```

`e2b sandbox exec`, `logs`, `metrics`, `pause` and `resume` work as usual. Run `polli sandbox ssh-config` once to ssh into the sandboxes they create. Auto-resume, snapshots, forks, IAM and volume mounts are not available.
