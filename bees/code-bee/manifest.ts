// code-bee — reference for the `container` runtime.
//
// The `worker` runtime in the bee manifest covers ~95% of bees: model + prompt
// + small state, V8 isolate. The `container` runtime exists for the other 5%:
// agentic bees that need shell, filesystem, and sandboxed code execution.
//
// code-bee is the canonical example. It hosts a Claude Agent SDK session per
// user — same SDK that powers Claude Code itself — scoped to a per-session
// working directory. A V8 worker can't run this: the agent uses `Bash`,
// `Read`, `Edit`, etc. on a real filesystem, and a single turn is a
// long-running async generator, not a request/response.
//
// For platform purposes, this manifest plus the runner in `src/runner.ts` is
// what the deploy API would dispatch to a container host (Daytona / AWS
// AgentCore / plain Docker).

import type { AgentManifest } from "../catgpt/manifest.ts";

export const codeBee: AgentManifest = {
    id: "code-bee",
    display_name: "Code Bee",
    description:
        "Claude-Code-style coding agent. Reads, edits, runs shell, scoped to a per-session working directory.",
    model: "claude-sonnet-4-6",
    surfaces: ["web", "cli", "rest", "openai"],
    runtime: { kind: "container" },
    state: {
        scope: "per-user",
        // sqlite on the container's mounted volume — transcript JSONLs live
        // in the per-session workdir, summaries in a small DB.
        backend: "sqlite",
        retention_days: 7,
    },
    billing: {
        // Container time is expensive; user-pays is the only sane default.
        default: "user-pays",
    },
};
