## Machines

A machine is a persistent Linux microVM that you own. Use it to host a
long-running agent or any coding harness: start it once, and it keeps running
until you stop it.

A machine differs from the [Computer MCP server](#tag/mcp-servers): the
Computer is a tool an agent calls, and it sleeps when idle. A machine is where
an agent lives.

### Create a machine

```bash
curl https://gen.pollinations.ai/machines \
  -H "Authorization: Bearer YOUR_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-agent",
    "image": "node:22-bookworm-slim",
    "command": ["node", "/root/agent.js"],
    "env": { "POLLINATIONS_API_KEY": "A_DEDICATED_KEY" }
  }'
```

- The disk survives a stop and start. Processes do not: `command` runs again
  on every start, so put the long-running process there.
- Give the machine its own API key in `env`, with a budget, instead of your
  account key.
- To let a harness inside the machine mint its own key, create the machine's
  key with `"accountPermissions": ["keys"]` on `POST /account/keys`
  (`polli machine create --mint-key` does this). That key can then create,
  list, and revoke your account's keys.
- Without `autoStopSeconds` the machine stays on.

### Permission and billing

- The key needs the `machines` account permission. Tick it when you create a
  key in the dashboard, or pass `"accountPermissions": ["machines"]` to
  `POST /account/keys`. `polli auth login` asks for it.
- A running machine costs pollen per hour, by size: see `pricePerHour` in
  each machine response. Quest Pollen counts.
- Creating, starting, or running a command pays the current hour if it is
  not paid yet. Each further hour is charged while the machine runs; a
  stopped machine costs nothing.
- If the wallet or the key's budget cannot cover an hour, the request gets
  a 402, and a running machine stops. Its disk survives, so start it again
  after you top up.

### Work with it

```bash
# Run a command
curl https://gen.pollinations.ai/machines/my-agent/exec \
  -H "Authorization: Bearer YOUR_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{"command": ["sh", "-c", "npm install -g opencode-ai"]}'

# Stop it. POST .../start boots it again, GET .../logs reads its logs,
# and DELETE /machines/my-agent removes it with its disk.
curl -X POST https://gen.pollinations.ai/machines/my-agent/stop \
  -H "Authorization: Bearer YOUR_SECRET_KEY"
```

Machines are private: every route accepts only the owner's keys. A
machine can call out to the internet, but nothing can call in yet, so agents
that poll or hold an outbound connection fit best.
