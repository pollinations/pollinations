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

/** Capture each file as it is before `on`. An existing snapshot keeps its original `before`. */
export const captureBefore = (
    ctx: HarnessContext,
    id: string,
    paths: string[],
): Snapshot => {
    const snapshot = loadSnapshot(ctx, id, paths) ?? {
        savedAt: new Date().toISOString(),
        files: {},
    };
    for (const path of paths) {
        snapshot.files[path] ??= {
            before: readTextIfExists(path),
            after: null,
        };
    }
    return snapshot;
};

export const recordAfter = (
    ctx: HarnessContext,
    id: string,
    snapshot: Snapshot,
    paths: string[],
) => {
    for (const path of paths) {
        snapshot.files[path].after = readTextIfExists(path);
    }
    // The snapshot holds the harness's credentials file, so keep it owner-only.
    writeTextAtomic(
        snapshotPath(ctx, id, paths),
        JSON.stringify(snapshot, null, 2),
        0o600,
    );
};

/** Put the files back byte-for-byte, unless something else edited them since `on`. */
export const restoreSnapshot = (
    ctx: HarnessContext,
    id: string,
    paths: string[],
): RestoreOutcome => {
    const snapshot = loadSnapshot(ctx, id, paths);
    if (!snapshot) return "missing";
    const entries = Object.entries(snapshot.files);
    if (entries.some(([path, file]) => readTextIfExists(path) !== file.after)) {
        return "modified";
    }
    for (const [path, file] of entries) {
        if (file.before === null) removeIfExists(path);
        else writeTextAtomic(path, file.before);
    }
    removeIfExists(snapshotPath(ctx, id, paths));
    return "restored";
};

export const clearSnapshot = (
    ctx: HarnessContext,
    id: string,
    paths: string[],
) => removeIfExists(snapshotPath(ctx, id, paths));
