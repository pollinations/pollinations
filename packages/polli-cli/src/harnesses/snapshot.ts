import { createHash } from "node:crypto";
import { join } from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { readTextIfExists, removeIfExists, writeTextAtomic } from "./fs.js";
import type { HarnessContext, OffOutcome } from "./types.js";

interface FileSnapshot {
    /** Content before the first `on`; null when the file did not exist. */
    before: string | null;
    /** Digest after the last `on`, used to detect edits without copying secrets. */
    afterHash: string | null;
    /**
     * "base64" when the file is binary (e.g. a sqlite config), detected by a
     * NUL byte; "text" (default) otherwise. before/afterHash are recorded in
     * the same encoding so both round-trip byte-for-byte.
     */
    encoding?: "text" | "base64";
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

/** Read a file for snapshotting, base64-encoding binary content. */
const readFileForSnapshot = (
    path: string,
): { content: string | null; encoding: "text" | "base64" } => {
    if (!existsSync(path)) return { content: null, encoding: "text" };
    const buffer = readFileSync(path);
    if (buffer.includes(0)) {
        return { content: buffer.toString("base64"), encoding: "base64" };
    }
    return { content: buffer.toString("utf-8"), encoding: "text" };
};

const readFileInEncoding = (
    path: string,
    encoding: "text" | "base64" | undefined,
): string | null => {
    if (!existsSync(path)) return null;
    const buffer = readFileSync(path);
    return encoding === "base64"
        ? buffer.toString("base64")
        : buffer.toString("utf-8");
};

const writeFileInEncoding = (
    path: string,
    content: string,
    encoding: "text" | "base64" | undefined,
) => {
    if (encoding === "base64") {
        writeFileSync(path, Buffer.from(content, "base64"));
        return;
    }
    writeTextAtomic(path, content);
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
        paths.map((path) => {
            const { content, encoding } = readFileForSnapshot(path);
            return [
                path,
                { before: content, afterHash: null, encoding },
            ];
        }),
    );

const restoreFiles = (files: Record<string, FileSnapshot>) => {
    for (const [path, file] of Object.entries(files)) {
        if (file.before === null) removeIfExists(path);
        else writeFileInEncoding(path, file.before, file.encoding);
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
        const current = readFileInEncoding(
            path,
            snapshot.files[path]?.encoding,
        );
        snapshot.files[path].afterHash =
            current === null ? null : sha256(current);
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
                ([path, file]) => {
                    const current = readFileInEncoding(path, file.encoding);
                    return (
                        (current === null ? null : sha256(current)) ===
                        file.afterHash
                    );
                },
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
