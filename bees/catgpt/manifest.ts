// Strawman AgentManifest — the single declaration the platform reads to host
// a bee. Schema is experimental; iterating in pollinations/pollinations#10628.
//
// Keep this file readable as a flat object. No runtime logic, no imports from
// implementations. Just data + a few types so multiple implementations can
// reference the same shape.

export type Surface =
  | "openai" // /v1/chat/completions with model: "<bee-id>"
  | "web" // browser chat (useChat / useAgentChat / SSE)
  | "discord"
  | "a2a" // Google A2A agent card + message/send
  | "rest" // ad-hoc HTTP, e.g. /ask
  | "cli";

export type RuntimeKind =
  | "worker" // Cloudflare Worker / Vercel Edge / Deno Deploy / etc.
  | "cloudflare-agent" // CF Agents framework — DO + SQLite
  | "node" // plain Node HTTP server (long-running container, Daytona-friendly)
  | "sandbox" // E2B/Daytona/Modal-style sandboxed exec (none today)
  | "external"; // hosted elsewhere; we just route to it

export type BillingRoute = "author-pays" | "user-pays";

export type AgentManifest = {
  id: string;
  display_name: string;
  description: string;

  // Model the bee talks to. Resolved against shared/registry/text.ts.
  model: string;

  // Public-facing surfaces. The platform spins up adapters per entry.
  surfaces: Surface[];

  // Runtime kind decides how/where the bee process lives.
  runtime: { kind: RuntimeKind };

  // State scope — same shape we sketched in #10628.
  state: {
    scope: "none" | "per-agent" | "per-user";
    discord_scope?: "user" | "channel";
    retention_days?: number; // client-decidable per #10628 retention discussion
  };

  // Billing route per surface. Default applies if no per-surface override.
  billing: {
    default: BillingRoute;
    per_surface?: Partial<Record<Surface, BillingRoute>>;
  };

  // Optional MCP tool servers the bee owns (Cassi-style — per the #10628 fit).
  tools_mcp?: string[];
};

// CatGPT's manifest. Each variant under implementations/ targets a subset of
// these surfaces and runtimes — see each variant README for what it implements.
export const catgpt: AgentManifest = {
  id: "catgpt",
  display_name: "CatGPT",
  description:
    "Aloof sarcastic cat that answers in 2-8 words and renders the exchange as a webcomic.",
  model: "claude-fast",
  surfaces: ["openai", "web", "discord", "cli"],
  runtime: { kind: "worker" },
  state: {
    scope: "per-user",
    discord_scope: "user",
    retention_days: 30,
  },
  billing: {
    default: "user-pays",
    per_surface: {
      // Author may want to eat a small cost for the OpenAI-compat surface so
      // CatGPT shows up as a free-tier model in the registry. Disabled by
      // default — flip to "author-pays" to enable.
    },
  },
};
