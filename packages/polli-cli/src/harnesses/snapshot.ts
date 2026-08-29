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

const snapshotPath = (ctx: HarnessContext, id: string) =>
    join(ctx.home, ".pollinations", "harnesses", `${id}.json`);

export const loadSnapshot = (
    ctx: HarnessContext,
    id: string,
): Snapshot | null => {
    const text = readTextIfExists(snapshotPath(ctx, id));
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
    const snapshot = loadSnapshot(ctx, id) ?? {
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
        snapshotPath(ctx, id),
        JSON.stringify(snapshot, null, 2),
        0o600,
    );
};

/** Put the files back byte-for-byte, unless something else edited them since `on`. */
export const restoreSnapshot = (
    ctx: HarnessContext,
    id: string,
): RestoreOutcome => {
    const snapshot = loadSnapshot(ctx, id);
    if (!snapshot) return "missing";
    const entries = Object.entries(snapshot.files);
    if (entries.some(([path, file]) => readTextIfExists(path) !== file.after)) {
        return "modified";
    }
    for (const [path, file] of entries) {
        if (file.before === null) removeIfExists(path);
        else writeTextAtomic(path, file.before);
    }
    removeIfExists(snapshotPath(ctx, id));
    return "restored";
};

export const clearSnapshot = (ctx: HarnessContext, id: string) =>
    removeIfExists(snapshotPath(ctx, id));
