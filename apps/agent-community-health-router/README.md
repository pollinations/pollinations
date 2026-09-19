# Community health router

A code agent that answers as a free community model, switching to a paid
fallback the moment the community pool can't handle the request.

## How it routes

On every call it fetches `GET /v1/models?status=all` and walks an ordered
list of community candidates:

1. Skip a candidate whose live `health.status` isn't `healthy`.
2. Skip a candidate missing `tool_calling` when the request sends `tools`.
3. Skip a candidate without image input support when the request sends an
   image part.
4. Forward to the first candidate left standing.
5. If none survive, forward to a paid fallback model.

The caller only ever sees the chosen model's answer — routing adds two
response headers, `x-pollinations-router-model` and
`x-pollinations-router-reason`, so the decision (and every skipped
candidate) stays inspectable without touching the reply body.

## Register it

1. [Fork this repository](https://github.com/davealan74/community-health-router/fork).
2. In [My Models](https://enter.pollinations.ai/my-models), choose **Add Agent → Code agent** and enter your fork's URL, or run:

   ```bash
   npx @pollinations/cli agents create --config code-agent.json
   ```

The source repository must be public; the agent itself can be private.

## Call it

```bash
curl https://gen.pollinations.ai/v1/responses \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"<your-github-username>/community-health-router","input":"Summarize this in one line."}'
```

[Agent guide](https://github.com/pollinations/pollinations/blob/main/BUILD_YOUR_OWN_AGENT.md)
