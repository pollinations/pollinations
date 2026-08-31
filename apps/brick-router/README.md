# Brick Router

[Brick](https://github.com/regolo-ai/brick-SR1) deployed as a Pollinations
endpoint agent. It selects among Pollinations GPT-5.6 tiers and forwards the
short-lived `ag_` token received from the gateway to the selected model. It
stores no Pollinations API key. The Worker verifies the run token through the
read-only `/account/key` endpoint before starting the container.

The container derives from Brick 2.3.1, distributed under Apache-2.0.

The first version uses Brick's local capability classifier with neutral
complexity. This keeps the deployment credential-free while retaining
capability- and cost-aware routing.

The candidate pool and its skill/cost weights live in `config.yaml`; Brick does
not query the Pollinations model registry. Gen still resolves the selected
model ID, enforces the caller's inherited permissions, and bills the child
request. A renamed or removed candidate therefore needs a matching config
update.

The public endpoint is `https://brick.pollinations.ai/v1` and its upstream
model is `brick`.

After the application reaches production, register it with an account-scoped
Pollinations key:

```bash
curl -X POST https://gen.pollinations.ai/account/my-models/endpoint-agents \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "brick",
    "title": "Brick",
    "description": "Capability- and cost-aware routing across GPT-5.6 model tiers.",
    "visibility": "public",
    "baseUrl": "https://brick.pollinations.ai/v1",
    "upstreamModel": "brick"
  }'
```
