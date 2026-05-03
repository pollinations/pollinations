# code-bee — reference for the `container` runtime

The Pollinations bee manifest has two runtime kinds:

- **`worker`** — V8 isolate. Stateless or DO-backed. ~95% of bees, including all of `bees/catgpt/`.
- **`container`** — long-running Node process with shell, filesystem, sandboxed code execution. The 5%.

`code-bee` is the canonical example of the `container` runtime. It hosts a [Claude Agent SDK](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk) session per user, scoped to a per-session working directory. A V8 worker can't run this — the agent calls `Read`, `Edit`, `Write`, `Bash` (opt-in), etc. on a real filesystem, and a single turn is a long-running async generator.

## Why the container runtime exists

Look at what the SDK signature requires:

```ts
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const msg of query({
  prompt: "rename foo.ts to bar.ts and update imports",
  options: { cwd: "/sessions/abc123", allowedTools: ["Read", "Edit", "Glob"] },
})) {
  // ...
}
```

Three things a `worker` can't provide:

1. `cwd` — a real filesystem mount per session.
2. Long-running async generator — workers have CPU time limits.
3. `Bash` / `Write` / `Edit` — these need a process to fork, files to mutate.

The `container` runtime is the platform's way of saying "this bee opts into all of that, and accepts the higher per-session cost."

## Layout

```
bees/code-bee/
├── README.md                ← this file
├── manifest.ts              ← AgentManifest with runtime.kind: "container"
├── manifest.test.ts
├── package.json             ← only @anthropic-ai/claude-agent-sdk
├── scripts/smoke.sh         ← unit tests + parse-check + structural check
├── src/
│   ├── runner.ts            ← runCodeBeeTurn(query, prompt, opts) — wraps the SDK
│   └── runner.test.ts       ← 5 tests, fake `query` (no SDK install needed)
└── surfaces/
    ├── cli/main.ts          ← terminal demo: node main.ts "<prompt>" --cwd <path>
    └── web-chat/
        ├── handler.ts       ← POST /chat → SSE: text / tool / done events
        └── handler.test.ts  ← 3 tests
```

## Dependency injection so tests stay install-free

The runner takes `query` as a function argument rather than importing it directly. Tests pass a fake async generator that emits the same `SDKMessage` shapes the real SDK emits; production wiring imports `query` from `@anthropic-ai/claude-agent-sdk` and passes it through.

This keeps the test suite consistent with the rest of `bees/` — `node --experimental-strip-types --test` with no `npm install`.

## Default toolset

`runCodeBeeTurn` defaults to `["Read", "Edit", "Write", "Glob", "Grep"]` — **no Bash**. Bash is opt-in because the blast radius is the entire workdir. Permission mode is `default` (prompt) unless caller passes `acceptEdits` or `bypassPermissions`.

## What this proves for the platform

1. **Two runtime kinds is enough.** `worker` covers chat-shaped bees; `container` covers Claude-Code-shaped bees. Anything in between (Bun-on-fly, Deno Deploy, Daytona) is a *deployment target*, not a runtime — chosen by ops, not by the bee author.
2. **Per-session cwd is the whole point of `container`.** That's the field a worker can't fake.
3. **Surface adapters port unchanged.** `surfaces/web-chat/` here uses the same SSE shape as `bees/catgpt/surfaces/web-chat/`. The platform mounts SSE the same way regardless of runtime.
4. **State scope `per-user` + backend `sqlite`** is honest about the container case: transcripts and per-user summaries live on the mounted volume, not in KV.

## Status

Reference, not for production. Skeleton + manifest + tests. The actual deploy
target (Daytona / AWS AgentCore / plain Docker / local docker-compose) is the
deploy API's concern, tracked in pollinations/pollinations#10628.
