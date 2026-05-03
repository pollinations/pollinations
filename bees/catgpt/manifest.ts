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

const SURFACE_VALUES: readonly Surface[] = [
    "openai",
    "web",
    "discord",
    "a2a",
    "rest",
    "cli",
];
const RUNTIME_VALUES: readonly RuntimeKind[] = [
    "worker",
    "cloudflare-agent",
    "node",
    "sandbox",
    "external",
];
const BILLING_VALUES: readonly BillingRoute[] = ["author-pays", "user-pays"];
const STATE_SCOPES = ["none", "per-agent", "per-user"] as const;

// Lightweight structural validation. Reports problems instead of throwing so
// the platform can surface all manifest errors at once instead of bisecting.
// Intentionally not a real schema validator — keeping the dep-free posture.
export function validateManifest(m: unknown): string[] {
    const errs: string[] = [];
    if (!m || typeof m !== "object") return ["manifest must be an object"];
    const x = m as Record<string, unknown>;

    if (typeof x.id !== "string" || !x.id) errs.push("id must be a string");
    if (typeof x.display_name !== "string" || !x.display_name)
        errs.push("display_name must be a string");
    if (typeof x.description !== "string")
        errs.push("description must be a string");
    if (typeof x.model !== "string" || !x.model)
        errs.push("model must be a string");

    if (!Array.isArray(x.surfaces)) {
        errs.push("surfaces must be an array");
    } else {
        for (const s of x.surfaces) {
            if (!SURFACE_VALUES.includes(s as Surface))
                errs.push(`unknown surface: ${String(s)}`);
        }
    }

    const runtime = x.runtime as { kind?: unknown } | undefined;
    if (!runtime || typeof runtime !== "object") {
        errs.push("runtime must be an object with a kind");
    } else if (!RUNTIME_VALUES.includes(runtime.kind as RuntimeKind)) {
        errs.push(`unknown runtime kind: ${String(runtime.kind)}`);
    }

    const state = x.state as { scope?: unknown } | undefined;
    if (!state || typeof state !== "object") {
        errs.push("state must be an object");
    } else if (
        !STATE_SCOPES.includes(state.scope as (typeof STATE_SCOPES)[number])
    ) {
        errs.push(`unknown state.scope: ${String(state.scope)}`);
    }

    const billing = x.billing as
        | { default?: unknown; per_surface?: unknown }
        | undefined;
    if (!billing || typeof billing !== "object") {
        errs.push("billing must be an object");
    } else {
        if (!BILLING_VALUES.includes(billing.default as BillingRoute))
            errs.push(`unknown billing.default: ${String(billing.default)}`);
        if (billing.per_surface) {
            for (const [surface, route] of Object.entries(
                billing.per_surface as Record<string, unknown>,
            )) {
                if (!SURFACE_VALUES.includes(surface as Surface))
                    errs.push(
                        `billing.per_surface uses unknown surface: ${surface}`,
                    );
                if (!BILLING_VALUES.includes(route as BillingRoute))
                    errs.push(
                        `billing.per_surface.${surface} unknown route: ${String(route)}`,
                    );
            }
        }
    }

    return errs;
}

// CatGPT's manifest. Each variant under implementations/ targets a subset of
// these surfaces and runtimes — see each variant README for what it implements.
export const catgpt: AgentManifest = {
    id: "catgpt",
    display_name: "CatGPT",
    description:
        "Aloof sarcastic cat that answers in 2-8 words and renders the exchange as a webcomic.",
    model: "claude-fast",
    surfaces: ["openai", "web", "discord", "a2a", "cli"],
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
