// Billing estimate for a deploy manifest. Runs at deploy-time (so users see
// what they'll be billed for in `--dry-run`) and at update-time.
//
// Same per-runtime-kind shape as codex's reference: workers don't get
// runtime_compute / workspace_storage; containers do. Adds two things on top:
//
//   1. A `clientId` field on the estimate (for user-pays bees) so the
//      response makes it obvious which App Key bears the cost.
//   2. Per-meter `note` strings — short hints the CLI can print directly
//      ("usage-based" vs "fixed-per-run"). Helps the dry-run output be
//      readable without a docs trip.

import type { ResolvedDeployManifest } from "./manifest-deploy.ts";

export type BillingMeter = {
    name: string;
    payer: "user-pays" | "author-pays";
    unit: string;
    note: string;
};

export type BillingEstimate = {
    currency: "pollen";
    mode: "user-pays" | "author-pays";
    clientId?: string;
    dailyPollenLimit?: number;
    meters: BillingMeter[];
};

export function estimateBilling(
    manifest: ResolvedDeployManifest,
): BillingEstimate {
    const mode = manifest.billing.default;
    const meters: BillingMeter[] = [
        {
            name: "model_calls",
            payer: mode,
            unit: "pollen_per_token",
            note: "Pass-through model pricing (see shared/registry/text.ts).",
        },
        {
            name: "orchestration",
            payer: mode,
            unit: "pollen_per_run",
            note: "Small platform fee per bee invocation.",
        },
        {
            name: "state_retention",
            payer: mode,
            unit: "pollen_per_gb_day_after_quota",
            note: `Retained ${manifest.state.retention_days ?? 0}d; quota for first GB-day is included.`,
        },
    ];

    if (manifest.runtime.kind === "container") {
        meters.push(
            {
                name: "runtime_compute",
                payer: mode,
                unit: "pollen_per_active_minute",
                note: "Container time while a session is warm. Auto-stops on idle.",
            },
            {
                name: "workspace_storage",
                payer: mode,
                unit: "pollen_per_gb_day",
                note: "Per-session workdir on the container's volume.",
            },
        );
    }

    return {
        currency: "pollen",
        mode,
        clientId: manifest.billing.clientId,
        dailyPollenLimit: manifest.billing.dailyPollenLimit,
        meters,
    };
}

// Required scopes — same shape as codex but split per actor more strictly.
// Developer scopes go on the deploy key (`sk_*`); invocation scopes go on
// the App Key (`pk_*`) for user-pays bees. Container bees additionally need
// `bees:exec` to run shell — separates "deploy" from "let it run code".
export type RequiredScopes = {
    developer: string[];
    invocation: string[];
};

export function requiredScopes(
    manifest: ResolvedDeployManifest,
): RequiredScopes {
    const developer = ["bees:read", "bees:write"];
    if (manifest.runtime.kind === "container") {
        developer.push("bees:exec");
    }
    if (manifest.surfaces.includes("discord")) {
        developer.push("bees:logs");
    }

    const invocation =
        manifest.billing.default === "user-pays" ? ["generate"] : [];

    return { developer, invocation };
}
