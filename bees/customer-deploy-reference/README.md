# Customer deploy API/CLI reference

Minimal control-plane sketch for letting customers deploy their own bees.

This is separate from the runtime examples. It answers:

- What manifest does a customer submit?
- What API creates and tracks a deployment?
- What CLI command would wrap that API?
- How do provider choices stay swappable?

## API

- `POST /v1/bees`
- `GET /v1/bees`
- `GET /v1/bees/{id}`
- `GET /v1/bees/{id}/events`
- `PATCH /v1/bees/{id}`
- `DELETE /v1/bees/{id}`

## CLI

```bash
node src/cli.js init bee.json --name booking-assistant
node src/cli.js validate bee.json
node src/cli.js deploy manifests/minimal-cloudflare.json
node src/cli.js deploy bee.json --dry-run
node src/cli.js deploy manifests/minimal-daytona.json --runtime daytona
node src/cli.js list
node src/cli.js status bee_booking-assistant
node src/cli.js events bee_booking-assistant
node src/cli.js delete bee_booking-assistant
```

The CLI currently uses the in-memory API store so it can run without services.
Production would point the same commands at `gen.pollinations.ai` or
`enter.pollinations.ai`.

## Runtime selection

Developers should not need to learn provider details for the common path. The
common manifest omits both `runtime` and `state`:

```json
{
  "name": "booking-assistant",
  "source": { "type": "git", "repository": "https://github.com/me/bee.git" },
  "surfaces": ["web", "a2a"],
  "billing": { "mode": "user-pays", "clientId": "pk_app_key" }
}
```

Missing runtime resolves to `worker + auto`, and missing `state.backend`
resolves to `sqlite`. Heavier runtimes stay explicit:

- `daytona` for shell/filesystem/coding-agent workspaces.
- `aws-agentcore` for AWS-credit/AgentCore experiments.
- `container` for generic self-hosted or future provider targets.
