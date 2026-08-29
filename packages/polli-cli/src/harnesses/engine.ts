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

export interface HarnessResult {
    harness: string;
    label: string;
    configured: boolean;
    model?: string;
    files: string[];
    /** `off` only: whether the pre-`on` files were restored byte-for-byte. */
    restored?: boolean;
}

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
    const restored = restoreSnapshot(ctx, profile.id) === "restored";
    if (!restored) {
        // No backup, or the user edited the config since `on`: only remove
        // what we added rather than clobbering their changes.
        profile.disable(ctx);
        clearSnapshot(ctx, profile.id);
    }
    return {
        harness: profile.id,
        label: profile.label,
        configured: false,
        files,
        restored,
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
