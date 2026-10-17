## Sandboxes

Run a cloud Linux computer through Pollinations, powered by E2B (alpha), and pay with credits. See [E2B’s API reference](https://docs.e2b.dev/api-reference/sandboxes/create-sandbox-v2) for request and response details; the Pollinations differences are below.

### Start with Pollinations

Create a sandbox in the [dashboard](https://enter.pollinations.ai/sandboxes), or use [polli](#tag/cli) with Node.js 20+:

<p align="left"><img src="https://media.pollinations.ai/7452f81b-4065-4af5-a65b-662c811e7ea2" alt="Sandboxes page on the dashboard" width="560"></p>

```bash
npm install -g @pollinations/cli
polli auth login
polli sandbox create
ssh <id>.polli
```

For dashboard-created sandboxes, run `polli sandbox ssh-config` first. VS Code’s Remote-SSH uses the same host.

### Use E2B SDKs or the API

Use a [Pollinations secret key](https://enter.pollinations.ai/keys) with `account:machines` permission:

```bash
export E2B_API_URL=https://gen.pollinations.ai/alpha/e2b
export E2B_API_KEY=sk_...
```

For REST requests, use this base URL and send the key as `Authorization: Bearer <key>`. Only your own sandboxes are accessible.

Supported operations: create, list, inspect, connect/resume, pause, delete, timeout, per-sandbox metrics, legacy logs and network updates. Prefer v2 for create, list and connect; logs use `/sandboxes/{id}/logs`. Other endpoints and auto-resume, IAM and volume mounts are unavailable.

### Credits and runtime

- Runtime is prepaid in credits. Long-running sandboxes renew in 10-minute windows. See [current rates, template sizes and concurrency limits](https://gen.pollinations.ai/alpha/e2b/pricing).
- Auto-pause defaults to on. Paused sandboxes incur no further runtime charges; unused prepaid time is not refunded.
- API timeouts above 600 seconds enable renewal until the requested deadline, subject to credits and key validity. Daily pause/resume preserves files and memory but drops connections.
- An open SSH connection keeps the sandbox running; after disconnecting, it pauses automatically. For background work, use `polli sandbox timeout <id> <seconds>`; CLI-only `0` means until stopped or credits/key access run out.
- `polli sandbox pause <id>` preserves state; `polli sandbox kill <id>` deletes the sandbox and its files.
- Pollinations templates created with `keys` permission receive a dedicated API key. Deleting the sandbox leaves that key; revoke it separately when no longer needed.
