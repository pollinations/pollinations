import { createHash } from "node:crypto";
import { join } from "node:path";
import { readTextIfExists, removeIfExists, writeTextAtomic } from "./fs.js";
import type { HarnessContext, OffOutcome } from "./types.js";

interface FileSnapshot {
    /** Content before the first `on`; null when the file did not exist. */
    before: string | null;
    /** Digest after the last `on`, used to detect edits without copying secrets. */
    afterHash: string | null;
}

interface Snapshot {
    complete: boolean;
    files: Record<string, FileSnapshot>;
}

const sha256 = (content: string) =>
    createHash("sha256").update(content).digest("hex");

// Keyed by the file set, so `off` after moving the harness home (e.g. a
// different DSH_HOME) never restores a backup taken for other files.
const snapshotPath = (ctx: HarnessContext, id: string, paths: string[]) => {
    const key = sha256(paths.join("\n")).slice(0, 12);
    return join(ctx.home, ".pollinations", "harnesses", `${id}.${key}.json`);
};

const contentHash = (content: string | null) =>
    content === null ? null : sha256(content);

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
            { before: readTextIfExists(path), afterHash: null },
        ]),
    );

const restoreFiles = (files: Record<string, FileSnapshot>) => {
    for (const [path, file] of Object.entries(files)) {
        if (file.before === null) removeIfExists(path);
        else writeTextAtomic(path, file.before);
    }
};

const loadSnapshot = (
    ctx: HarnessContext,
    id: string,
    paths: string[],
): Snapshot | null => {
    const text = readTextIfExists(snapshotPath(ctx, id, paths));
    if (!text) return null;
    return JSON.parse(text) as Snapshot;
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
        snapshot.files[path].afterHash = contentHash(readTextIfExists(path));
    }
    snapshot.complete = true;
    writeSnapshot(ctx, id, paths, snapshot);
};

/** Restore untouched files byte-for-byte; otherwise strip only our config. */
export const restoreOrStrip = (
    ctx: HarnessContext,
    id: string,
    paths: string[],
    strip: () => boolean,
): OffOutcome => {
    const snapshot = loadSnapshot(ctx, id, paths);
    if (
        snapshot &&
        (!snapshot.complete ||
            Object.entries(snapshot.files).every(
                ([path, file]) =>
                    contentHash(readTextIfExists(path)) === file.afterHash,
            ))
    ) {
        restoreFiles(snapshot.files);
        clearSnapshot(ctx, id, paths);
        return "restored";
    }

    const outcome = strip() ? "stripped" : "unchanged";
    clearSnapshot(ctx, id, paths);
    return outcome;
};

const clearSnapshot = (ctx: HarnessContext, id: string, paths: string[]) =>
    removeIfExists(snapshotPath(ctx, id, paths));
