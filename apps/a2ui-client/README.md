# A2UI client

A small test client for [A2UI](https://a2ui.org) v0.9 on Pollinations. It
streams a chat reply from `gen.pollinations.ai`, renders each
`<a2ui-json>…</a2ui-json>` block with `@a2ui/react` and the basic catalog, and
sends button clicks back to the agent as the next user message
(`{"version":"v0.9","action":{…}}`).

The agent it talks to is defined in
[`../agent-a2ui-demo/agent.json`](../agent-a2ui-demo/agent.json).

## Run

```bash
npm install
npm run dev
```

Paste an API key from https://enter.pollinations.ai/keys. The key stays in
this tab's `sessionStorage`.

## Create the hosted agent

```bash
polli agents create --config apps/agent-a2ui-demo/agent.json
```

Agents are private by default (add `--visibility public` to share one). The
agent is callable as `community/<your-github-username>/a2ui-demo`; a private
agent only answers its owner's key. Put that id in the Model field.

## Test a base model instead

Tick "Send the A2UI system prompt myself". The client then sends the agent's
`systemPrompt` itself and switches the model to the agent's `baseModel`, so
you can try the prompt on any text model without creating an agent.

## Check

```bash
npm test          # <a2ui-json> extractor
npm run typecheck
npm run build
```
