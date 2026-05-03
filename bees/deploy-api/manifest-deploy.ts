// Deploy-time manifest. Extends bees/catgpt/manifest.ts:AgentManifest with
// the fields the control plane needs to actually create a deployment:
//
//   - `source`            — where to fetch the bee's code (git/template/bundle)
//   - `name`              — kebab-case identifier the platform uses to mint a
//                           deployment id. Distinct from AgentManifest.id which
//                           is the bee author's stable type id (e.g. "catgpt"),
//                           whereas name is the *deployment* slug (e.g.
//                           "my-catgpt-clone").
//   - `billing.clientId`  — the App Key (`pk_*`) that user-pays invocations
//                           bill against. Required for user-pays mode.
//   - `billing.dailyPollenLimit` — optional spending cap per UTC day.
//   - `env`               — public, non-secret env vars surfaced to the bee
//                           process. Secrets go through a separate channel,
//                           never the manifest.
//
// Why not bake all of this into AgentManifest directly? Because most of bees/
// (catgpt's 12 variants, code-bee's 4 surfaces) cares about the *runtime
// shape* of a bee (what it does), not how it's deployed. Tests for those
// don't need to know about source/billing/env. Keeping deploy concerns in a
// supertype keeps the catgpt tests narrow and the deploy tests focused.

import type {
    AgentManifest,
    BillingRoute,
    ResolvedAgentManifest,
} from "../catgpt/manifest.ts";
import {
    resolveManifest as resolveAgentManifest,
    validateManifest as validateAgentManifest,
} from "../catgpt/manifest.ts";

export type SourceSpec =
    | { type: "git"; repository: string; ref?: string; packagePath?: string }
    | { type: "template"; template: string }
    | { type: "bundle"; uploadId: string };

export type DeployManifest = AgentManifest & {
    // Deployment slug. Lowercase letters, digits, hyphens. Not the same as
    // AgentManifest.id (which is the type id). Codex uses `name` only and
    // omits an explicit type id — we keep both because catgpt's existing
    // surfaces key off id, not name.
    name: string;

    source: SourceSpec;

    billing: AgentManifest["billing"] & {
        clientId?: string; // required for user-pays
        dailyPollenLimit?: number; // optional per-day spend cap
    };

    env?: Record<string, string>;
};

export type ResolvedDeployManifest = ResolvedAgentManifest & DeployManifest;

// Obvious-placeholder client IDs that pass shape validation but are clearly
// not real keys. Reject these early so a user who runs `init` then `deploy`
// without editing gets a useful error instead of a silently-broken deploy.
const PLACEHOLDER_CLIENT_IDS = new Set([
    "pk_replace_me",
    "pk_app_key",
    "pk_your_key",
    "pk_xxx",
]);

const SOURCE_TYPES = new Set(["git", "template", "bundle"]);

const NAME_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

export function validateDeployManifest(m: unknown): string[] {
    const baseErrors = validateAgentManifest(m);
    const errs = [...baseErrors];

    if (!m || typeof m !== "object") return errs;
    const x = m as Record<string, unknown>;

    // name — kebab-case, 1..64 chars
    if (typeof x.name !== "string" || !x.name) {
        errs.push("name must be a non-empty string");
    } else if (!NAME_RE.test(x.name) || x.name.length > 64) {
        errs.push(
            "name must be lowercase letters, digits, and hyphens (no leading/trailing hyphen), max 64 chars",
        );
    }

    // source
    const source = x.source as { type?: unknown } | undefined;
    if (!source || typeof source !== "object") {
        errs.push("source must be an object");
    } else if (
        typeof source.type !== "string" ||
        !SOURCE_TYPES.has(source.type)
    ) {
        errs.push(`source.type must be one of: git, template, bundle`);
    } else {
        const s = source as Record<string, unknown>;
        if (s.type === "git") {
            if (typeof s.repository !== "string" || !s.repository)
                errs.push("source.repository must be a string for git source");
        } else if (s.type === "template") {
            if (typeof s.template !== "string" || !s.template)
                errs.push(
                    "source.template must be a string for template source",
                );
        } else if (s.type === "bundle") {
            if (typeof s.uploadId !== "string" || !s.uploadId)
                errs.push("source.uploadId must be a string for bundle source");
        }
    }

    // billing.clientId — required for user-pays, reject placeholders
    const billing = x.billing as Record<string, unknown> | undefined;
    if (billing && typeof billing === "object") {
        const mode = billing.default as BillingRoute;
        if (mode === "user-pays") {
            if (typeof billing.clientId !== "string" || !billing.clientId) {
                errs.push("billing.clientId is required for user-pays bees");
            } else if (PLACEHOLDER_CLIENT_IDS.has(billing.clientId)) {
                errs.push(
                    `billing.clientId looks like a placeholder ("${billing.clientId}") — replace with a real pk_ App Key from enter.pollinations.ai`,
                );
            } else if (!billing.clientId.startsWith("pk_")) {
                errs.push(
                    "billing.clientId must be a public key starting with pk_ (sk_ keys must not be in manifests)",
                );
            }
        }
        if (
            billing.dailyPollenLimit !== undefined &&
            (typeof billing.dailyPollenLimit !== "number" ||
                !Number.isFinite(billing.dailyPollenLimit) ||
                billing.dailyPollenLimit <= 0)
        ) {
            errs.push("billing.dailyPollenLimit must be a positive number");
        }
    }

    // env — string-to-string map only
    if (x.env !== undefined) {
        if (
            typeof x.env !== "object" ||
            x.env === null ||
            Array.isArray(x.env)
        ) {
            errs.push("env must be an object of string→string");
        } else {
            for (const [k, v] of Object.entries(x.env)) {
                if (typeof v !== "string")
                    errs.push(`env.${k} must be a string`);
            }
        }
    }

    return errs;
}

// Apply defaults. Reuses the agent-manifest resolver for runtime/state, then
// fills in the deploy-specific shape.
export function resolveDeployManifest(m: DeployManifest): {
    resolved: ResolvedDeployManifest;
    errors: string[];
} {
    const errors = validateDeployManifest(m);
    const { resolved: agent } = resolveAgentManifest(m);
    const resolved: ResolvedDeployManifest = {
        ...m,
        runtime: agent.runtime,
        state: agent.state,
    };
    return { resolved, errors };
}

export function isPlaceholderClientId(id: string): boolean {
    return PLACEHOLDER_CLIENT_IDS.has(id);
}
