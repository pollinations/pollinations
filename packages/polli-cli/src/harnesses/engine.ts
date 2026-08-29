import { spawnSync } from "node:child_process";
import {
    captureBefore,
    clearSnapshot,
    recordAfter,
    restoreSnapshot,
} from "./snapshot.js";
import type {
    HarnessContext,
    HarnessProfile,
    HarnessSettings,
} from "./types.js";

/** What `off` did: backup restored byte-for-byte, only our entries removed, or nothing to do. */
export type OffOutcome = "restored" | "stripped" | "unchanged";

export interface HarnessResult {
    harness: string;
    label: string;
    configured: boolean;
    model?: string;
    files: string[];
    outcome?: OffOutcome;
}

export const needsInstall = (profile: HarnessProfile, ctx: HarnessContext) =>
    profile.install !== undefined && !profile.install.installed(ctx);

/** Run the harness's official installer through the shell, streaming its output. */
export const installHarness = (
    profile: HarnessProfile,
    ctx: HarnessContext,
) => {
    if (!profile.install) return;
    const run = spawnSync(profile.install.command, {
        shell: true,
        stdio: "inherit",
        env: ctx.env,
    });
    if (run.status !== 0) {
        throw new Error(
            `installer exited with ${run.status ?? run.signal}: ${profile.install.command}`,
        );
    }
};

export const enableHarness = (
    profile: HarnessProfile,
    ctx: HarnessContext,
    settings: HarnessSettings,
): HarnessResult => {
    const files = profile.files(ctx);
    const snapshot = captureBefore(ctx, profile.id, files);
    profile.enable(ctx, settings);
    recordAfter(ctx, profile.id, snapshot, files);
    return {
        harness: profile.id,
        label: profile.label,
        configured: true,
        model: settings.model,
        files,
    };
};

export const disableHarness = (
    profile: HarnessProfile,
    ctx: HarnessContext,
): HarnessResult => {
    const files = profile.files(ctx);
    let outcome: OffOutcome = "restored";
    if (restoreSnapshot(ctx, profile.id, files) !== "restored") {
        // No backup for these files, or the user edited them since `on`:
        // only remove what we added rather than clobbering their changes.
        outcome = profile.disable(ctx) ? "stripped" : "unchanged";
        clearSnapshot(ctx, profile.id, files);
    }
    return {
        harness: profile.id,
        label: profile.label,
        configured: false,
        files,
        outcome,
    };
};

export const harnessStatus = (
    profile: HarnessProfile,
    ctx: HarnessContext,
): HarnessResult => ({
    harness: profile.id,
    label: profile.label,
    ...profile.status(ctx),
    files: profile.files(ctx),
});
