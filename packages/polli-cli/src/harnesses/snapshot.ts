import { createHash } from "node:crypto";
import { join } from "node:path";
import { readTextIfExists, removeIfExists, writeTextAtomic } from "./fs.js";
import type { HarnessContext } from "./types.js";

interface FileSnapshot {
    /** Content before the first `on`; null when the file did not exist. */
    before: string | null;
    /** Content right after the last `on`, to detect edits made since. */
    after: string | null;
}

export interface Snapshot {
    savedAt: string;
    complete: boolean;
    files: Record<string, FileSnapshot>;
}

export type RestoreOutcome = "restored" | "modified" | "missing";

// Keyed by the file set, so `off` after moving the harness home (e.g. a
// different DSH_HOME) never restores a backup taken for other files.
const snapshotPath = (ctx: HarnessContext, id: string, paths: string[]) => {
    const key = createHash("sha256")
        .update(paths.join("\n"))
        .digest("hex")
        .slice(0, 12);
    return join(ctx.home, ".pollinations", "harnesses", `${id}.${key}.json`);
};

const writeSnapshot = (
    ctx: HarnessContext,
    id: string,
    paths: string[],
    snapshot: Snapshot,
) =>
    writeTextAtomic(
        snapshotPath(ctx, id, paths),
        JSON.stringify(snapshot, null, 2),
        0o600,
    );

const captureFiles = (paths: string[]) =>
    Object.fromEntries(
        paths.map((path) => [
            path,
            { before: readTextIfExists(path), after: null },
        ]),
    );

const restoreFiles = (files: Record<string, FileSnapshot>) => {
    for (const [path, file] of Object.entries(files)) {
        if (file.before === null) removeIfExists(path);
        else writeTextAtomic(path, file.before);
    }
};

export const loadSnapshot = (
    ctx: HarnessContext,
    id: string,
    paths: string[],
): Snapshot | null => {
    const text = readTextIfExists(snapshotPath(ctx, id, paths));
    if (!text) return null;
    try {
        return JSON.parse(text) as Snapshot;
    } catch {
        return null;
    }
};

/**
 * Apply a config update with a persisted pre-change snapshot. A failed update
 * is rolled back immediately; a successful update stays reversible with `off`.
 */
export const applyWithSnapshot = (
    ctx: HarnessContext,
    id: string,
    paths: string[],
    apply: () => void,
): void => {
    const existing = loadSnapshot(ctx, id, paths);
    const rollback = captureFiles(paths);
    const snapshot = existing ?? {
        savedAt: new Date().toISOString(),
        complete: false,
        files: rollback,
    };

    if (!existing) writeSnapshot(ctx, id, paths, snapshot);

    try {
        apply();
    } catch (error) {
        try {
            restoreFiles(rollback);
            if (!existing) clearSnapshot(ctx, id, paths);
        } catch (rollbackError) {
            throw new AggregateError(
                [error, rollbackError],
                "Harness setup failed and its config could not be restored",
            );
        }
        throw error;
    }

    for (const path of paths) {
        snapshot.files[path].after = readTextIfExists(path);
    }
    snapshot.complete = true;
    writeSnapshot(ctx, id, paths, snapshot);
};

/** Put the files back byte-for-byte, unless something else edited them since `on`. */
export const restoreSnapshot = (
    ctx: HarnessContext,
    id: string,
    paths: string[],
): RestoreOutcome => {
    const snapshot = loadSnapshot(ctx, id, paths);
    if (!snapshot) return "missing";

    if (!snapshot.complete) {
        restoreFiles(snapshot.files);
        removeIfExists(snapshotPath(ctx, id, paths));
        return "restored";
    }

    const entries = Object.entries(snapshot.files);
    if (entries.some(([path, file]) => readTextIfExists(path) !== file.after)) {
        return "modified";
    }
    restoreFiles(snapshot.files);
    removeIfExists(snapshotPath(ctx, id, paths));
    return "restored";
};

export const clearSnapshot = (
    ctx: HarnessContext,
    id: string,
    paths: string[],
) => removeIfExists(snapshotPath(ctx, id, paths));
