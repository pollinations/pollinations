## Sandboxes

A cloud Linux computer you open with SSH or VS Code, run on E2B or Azure (alpha) and paid with credits.

### Create and connect

Create a sandbox in the [dashboard](https://enter.pollinations.ai/sandboxes), or use [polli](#tag/cli) with Node.js 20+.

<p align="left"><img src="https://media.pollinations.ai/7452f81b-4065-4af5-a65b-662c811e7ea2" alt="Sandboxes page on the dashboard" width="560"></p>

```bash
npm install -g @pollinations/cli
polli auth login
polli sandbox create
# Or choose the larger template:
polli sandbox create pollinations-large
# Or run it on Azure instead of E2B:
polli sandbox create pollinations-azure
ssh <id>.polli
# Open its port 3000 at http://localhost:3000:
ssh -L 3000:localhost:3000 <id>.polli
polli sandbox list
```

For dashboard-created sandboxes, run `polli sandbox ssh-config` first. VS Code's Remote-SSH connects to `<id>.polli`. If it only says the connection closed, run `ssh <id>.polli` in a terminal to see why.

### E2B or Azure

The template sets where a sandbox runs: `pollinations` and `pollinations-large` on E2B, `pollinations-azure` and `pollinations-azure-large` on Azure with the same software and sizes, and `pollinations-azure-xl` (8 vCPU, 16 GB) on Azure only. The differences:

- E2B pauses and resumes long runs once a day; Azure runs them without that break.
- Azure's disks are larger: about 40, 80 and 160 GB for its three sizes, against 27 GB on E2B.
- Each provider has its own rates; see [current rates](https://gen.pollinations.ai/alpha/e2b/pricing).
- On Azure, a sandbox stops at the first 5-minute mark after its timeout, and that time is billed.
- ssh into sandboxes on Azure needs polli 0.1.59 or newer: update with `npm i -g @pollinations/cli && polli sandbox ssh-config`.
- E2B's SDKs reach sandboxes on Azure only with `E2B_SANDBOX_URL` set; see [Sandboxes API](#tag/sandboxes-api).

### Use E2B SDKs or the API

E2B's SDKs, CLI and REST API work with a Pollinations key: see [Sandboxes API](#tag/sandboxes-api) for the setup, supported endpoints and differences.

### Credits and runtime

- Runtime is prepaid in credits. See [current rates, template sizes and concurrency limits](https://gen.pollinations.ai/alpha/e2b/pricing).
- Auto-pause defaults to on. Paused sandboxes cost nothing; unused prepaid time is not refunded.
- API timeouts above 600 seconds renew in 10-minute windows until the deadline, subject to credits, key budget and validity. E2B limits runs to 24 hours, so Pollinations pauses and resumes them once a day, preserving files, memory and processes but dropping connections.
- SSH and VS Code connections keep it running. Without a background timeout, it pauses 15–20 minutes after the last connection closes (5–10 without SSH connection sharing, including Windows). For background work, `polli sandbox timeout <id> 0` keeps it running until stopped, subject to credits and key validity. The API requires seconds; it has no unlimited setting.
- `polli sandbox pause <id>` preserves state; `polli sandbox kill <id>` deletes the sandbox and its files.
- Sandboxes from Pollinations templates, created with a key that has the `keys` permission, get their own API key. Deleting the sandbox leaves it; revoke it on the [Keys page](https://enter.pollinations.ai/keys) when no longer needed.
