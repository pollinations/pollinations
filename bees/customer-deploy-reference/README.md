# Customer deploy API/CLI reference

Minimal control-plane sketch for letting customers deploy their own bees.

This is separate from the runtime examples. It answers:

- What manifest does a customer submit?
- What API creates and tracks a deployment?
- What CLI command would wrap that API?
- How do provider choices stay swappable?

## API

- `POST /api/bees`
- `POST /api/bees?upgrade=1`
- `GET /api/bees`
- `GET /api/bees/{id}`
- `GET /api/bees/{id}/events`
- `PATCH /api/bees/{id}`
- `DELETE /api/bees/{id}`

## CLI

```bash
polli bees init bee.json --name booking-assistant
polli bees validate bee.json
polli bees deploy bee.json --dry-run
polli bees deploy bee.json
polli bees deploy bee.json --upgrade
polli bees deploy bee.json --runtime daytona
polli bees list
polli bees status bee_booking-assistant
polli bees events bee_booking-assistant
polli bees delete bee_booking-assistant --yes
```

`polli bees deploy --dry-run` resolves locally so developers can inspect
runtime, provider, URLs, scopes, and Pollen meters without calling the network.
Non-dry-run deploy and management commands call the `/api/bees` API.
Repeated deploys of the same bee id return a conflict unless `--upgrade`
is passed, which maps to `POST /api/bees?upgrade=1`.

The local `node src/cli.js ...` script remains a standalone control-plane sketch
for tests and experiments. The developer-facing path is `polli bees ...`.

## Runtime selection

Developers should not need to learn provider details for the common path. The
common manifest omits both `runtime` and `state`:

```json
{
  "name": "booking-assistant",
  "source": { "type": "git", "repository": "https://github.com/me/bee.git" },
  "surfaces": ["web", "a2a"],
  "billing": { "mode": "author-pays" }
}
```

Missing runtime resolves to `worker + auto`, and missing `state.backend`
resolves to `sqlite`. Heavier runtimes stay explicit:

- `daytona` for shell/filesystem/coding-agent workspaces.
- `aws-agentcore` for AWS-credit/AgentCore experiments.
- `container` for generic self-hosted or future provider targets.
