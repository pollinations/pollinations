## Sandboxes

Run code, development servers and coding agents on a cloud Linux computer, powered by E2B (alpha). Connect through SSH or VS Code and pay with your Pollinations credits.

[Sandboxes API reference](#tag/sandboxes-api) · [CLI reference](#tag/cli)

### Create and connect

Create a sandbox from the [dashboard](https://enter.pollinations.ai/sandboxes), or use the CLI below. The CLI needs Node.js 20+ and account credits.

<p align="left"><img src="https://media.pollinations.ai/7452f81b-4065-4af5-a65b-662c811e7ea2" alt="Sandboxes page on the dashboard" width="560"></p>

```bash
npm install -g @pollinations/cli
polli auth login
polli sandbox create
ssh <id>.polli
```

Replace `<id>` with the ID printed by `create`. For a sandbox created in the dashboard, run `polli sandbox ssh-config` once before connecting. VS Code's Remote-SSH uses the same `<id>.polli` host.

Templates include Python, Node.js and coding tools; `pollinations-large` has more CPU and memory. To preview port 3000:

```bash
ssh -L 3000:localhost:3000 <id>.polli
```

Then open `http://localhost:3000` in your browser.

### Pause, resume or delete

| Action | Command | What happens |
| --- | --- | --- |
| Pause | `polli sandbox pause <id>` | Saves files, memory and processes; stops running. |
| Resume | `ssh <id>.polli` | Continues where you left off. |
| Delete | `polli sandbox kill <id>` | Permanently deletes the sandbox and its files. |

An open SSH or VS Code connection keeps the sandbox running. By default, it pauses after you disconnect, usually within 15–20 minutes (5–10 minutes without SSH connection sharing).

For background work, `polli sandbox timeout <id> 14400` keeps it running for four hours without a connection. It still needs sufficient credits and a valid key with remaining budget. Long-running sandboxes briefly pause and resume once a day, dropping open connections but preserving files, memory and processes.

### Costs and limits

- CPU and memory usage is charged in **credits, prepaid 10 minutes ahead**. See [current rates and template sizes](https://gen.pollinations.ai/alpha/e2b/pricing).
- Paused sandboxes incur no further charges. **Unused prepaid time is not refunded** when you pause, delete or shorten the timeout; resuming starts a new payment.
- Creation needs enough account balance and key budget for the first payment. Up to **8 sandboxes** can run per account.
- Pollinations templates created with `keys` permission receive a dedicated API key. Deletion leaves that key; revoke it from [API Keys](https://enter.pollinations.ai/keys) if no longer needed.

For SSH troubleshooting, custom templates, storage and E2B SDK setup, see the [sandbox reference](#tag/sandboxes-api).
