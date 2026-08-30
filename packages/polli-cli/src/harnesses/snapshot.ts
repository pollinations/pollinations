import { createHash } from "node:crypto";
import { isAbsolute, join, relative, resolve } from "node:path";
import { readTextIfExists, removeIfExists, writeTextAtomic } from "./fs.js";
import type { HarnessContext } from "./types.js";

const SNAPSHOT_VERSION = 1 as const;
const SNAPSHOT_ENCODING = "base64" as const;

/** The decoded form used by harness adapters while restoring or cleaning up. */
export interface HarnessFileSnapshot {
    /** Content before the first `on`; null when the file did not exist. */
    before: string | null;
    /** Digest after the last `on`, used to detect edits without copying secrets. */
    afterHash: string | null;
}

export interface HarnessSnapshot {
    version: typeof SNAPSHOT_VERSION;
    complete: boolean;
    /** Once set, repeated `on` calls can never opt back into byte restoration. */
    modified: boolean;
    files: Record<string, HarnessFileSnapshot>;
    /** Optional non-secret adapter ownership data used for surgical cleanup. */
    metadata?: Record<string, unknown>;
}

type RestoreOutcome = "restored" | "modified" | "missing";

interface PersistedFileSnapshot {
    before: string | null;
    beforeEncoding: typeof SNAPSHOT_ENCODING;
    afterHash: string | null;
}

interface PersistedSnapshot {
    version: typeof SNAPSHOT_VERSION;
    complete: boolean;
    modified: boolean;
    files: Record<string, PersistedFileSnapshot>;
    metadata?: Record<string, unknown>;
}

export type SnapshotMetadata =
    | Record<string, unknown>
    | ((
          existing: Record<string, unknown> | undefined,
      ) => Record<string, unknown>);

interface SnapshotRecord {
    path: string;
    text: string;
    snapshot: HarnessSnapshot;
}

const sha256 = (content: string) =>
    createHash("sha256").update(content).digest("hex");

const contentHash = (content: string | null) =>
    content === null ? null : sha256(content);

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const exactKeys = (value: Record<string, unknown>, keys: string[]) => {
    const actual = Object.keys(value).sort();
    const expected = [...keys].sort();
    return (
        actual.length === expected.length &&
        actual.every((key, index) => key === expected[index])
    );
};

const normalizedPaths = (paths: string[], managedRoot?: string): string[] => {
    if (paths.length === 0) throw new Error("Harness snapshot has no files");

    const normalized = paths.map((path) => {
        if (typeof path !== "string" || !isAbsolute(path)) {
            throw new Error("Harness snapshot paths must be absolute");
        }
        const resolvedPath = resolve(path);
        if (resolvedPath !== path) {
            throw new Error("Harness snapshot paths must be normalized");
        }
        return resolvedPath;
    });
    if (new Set(normalized).size !== normalized.length) {
        throw new Error("Harness snapshot paths must be unique");
    }

    if (managedRoot !== undefined) {
        if (!isAbsolute(managedRoot)) {
            throw new Error("Harness snapshot root must be absolute");
        }
        const root = resolve(managedRoot);
        for (const path of normalized) {
            const child = relative(root, path);
            if (child === "" || child.startsWith("..") || isAbsolute(child)) {
                throw new Error(
                    "Harness snapshot path is outside its agent directory",
                );
            }
        }
    }

    return normalized;
};

// Keyed by the file set, so `off` after moving the harness home (e.g. a
// different DSH_HOME) never restores a backup taken for other files.
export const harnessSnapshotPath = (
    ctx: HarnessContext,
    id: string,
    paths: string[],
) => {
    const normalized = normalizedPaths(paths);
    const key = sha256(normalized.join("\n")).slice(0, 12);
    return join(ctx.home, ".pollinations", "harnesses", `${id}.${key}.json`);
};

const encodeBefore = (before: string | null): string | null =>
    before === null ? null : Buffer.from(before, "utf8").toString("base64");

const decodeBefore = (path: string, value: unknown): string | null => {
    if (value === null) return null;
    if (typeof value !== "string") {
        throw new Error(`${path}.before must be a base64 string or null`);
    }
    // Buffer.from accepts malformed base64 by silently discarding characters;
    // reject anything that is not a canonical round-trippable representation.
    if (
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(
            value,
        )
    ) {
        throw new Error(`${path}.before is not valid base64`);
    }
    const decoded = Buffer.from(value, "base64").toString("utf8");
    if (Buffer.from(decoded, "utf8").toString("base64") !== value) {
        throw new Error(`${path}.before is not canonical base64`);
    }
    return decoded;
};

const decodeHash = (path: string, value: unknown): string | null => {
    if (value === null) return null;
    if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) {
        throw new Error(`${path}.afterHash must be a SHA-256 digest or null`);
    }
    return value;
};

const parsePersistedSnapshot = (
    path: string,
    text: string,
    paths: string[],
    managedRoot?: string,
): HarnessSnapshot => {
    const expectedPaths = normalizedPaths(paths, managedRoot);
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch (error) {
        const detail = error instanceof Error ? error.message : "invalid JSON";
        throw new Error(`Invalid harness snapshot ${path}: ${detail}`);
    }
    if (!isRecord(parsed)) {
        throw new Error(`Invalid harness snapshot ${path}: expected an object`);
    }
    const currentSchema =
        exactKeys(parsed, ["version", "complete", "files"]) ||
        exactKeys(parsed, ["version", "complete", "modified", "files"]) ||
        exactKeys(parsed, [
            "version",
            "complete",
            "modified",
            "files",
            "metadata",
        ]);
    const legacySchema = exactKeys(parsed, ["complete", "files"]);
    if (!currentSchema && !legacySchema) {
        throw new Error(`Invalid harness snapshot ${path}: unexpected schema`);
    }
    if (legacySchema) {
        if (typeof parsed.complete !== "boolean" || !isRecord(parsed.files)) {
            throw new Error(
                `Invalid harness snapshot ${path}: invalid legacy schema`,
            );
        }
        return parseFiles(
            path,
            parsed.files,
            expectedPaths,
            false,
            parsed.complete,
            false,
        );
    }
    if (parsed.version !== SNAPSHOT_VERSION) {
        throw new Error(
            `Invalid harness snapshot ${path}: unsupported version`,
        );
    }
    if (typeof parsed.complete !== "boolean") {
        throw new Error(
            `Invalid harness snapshot ${path}: complete must be boolean`,
        );
    }
    if (parsed.modified !== undefined && typeof parsed.modified !== "boolean") {
        throw new Error(
            `Invalid harness snapshot ${path}: modified must be boolean`,
        );
    }
    if (!isRecord(parsed.files)) {
        throw new Error(
            `Invalid harness snapshot ${path}: files must be an object`,
        );
    }

    if (parsed.metadata !== undefined && !isRecord(parsed.metadata)) {
        throw new Error(
            `Invalid harness snapshot ${path}: metadata must be an object`,
        );
    }

    return parseFiles(
        path,
        parsed.files,
        expectedPaths,
        true,
        parsed.complete,
        parsed.modified ?? false,
        parsed.metadata,
    );
};

const parseFiles = (
    path: string,
    persistedFiles: Record<string, unknown>,
    expectedPaths: string[],
    encoded: boolean,
    complete: boolean,
    modified: boolean,
    metadata?: Record<string, unknown>,
): HarnessSnapshot => {
    const actualPaths = Object.keys(persistedFiles);
    if (
        actualPaths.length !== expectedPaths.length ||
        expectedPaths.some(
            (filePath) => !Object.hasOwn(persistedFiles, filePath),
        )
    ) {
        throw new Error(
            `Invalid harness snapshot ${path}: managed paths changed`,
        );
    }

    const files: Record<string, HarnessFileSnapshot> = {};
    for (const filePath of expectedPaths) {
        const file = persistedFiles[filePath];
        if (!isRecord(file)) {
            throw new Error(
                `Invalid harness snapshot ${path}: invalid file entry`,
            );
        }
        const canonical = exactKeys(file, [
            "before",
            "beforeEncoding",
            "afterHash",
        ]);
        const transitional = exactKeys(file, [
            "before",
            "afterHash",
            "beforeHash",
            "beforeBase64",
        ]);
        const legacy = exactKeys(file, ["before", "afterHash"]);
        if ((!encoded && !legacy) || (encoded && !canonical && !transitional)) {
            throw new Error(
                `Invalid harness snapshot ${path}: invalid file entry`,
            );
        }
        if (canonical && file.beforeEncoding !== SNAPSHOT_ENCODING) {
            throw new Error(
                `Invalid harness snapshot ${path}: unsupported before encoding`,
            );
        }
        const before = canonical
            ? decodeBefore(
                  `${path}.files[${JSON.stringify(filePath)}]`,
                  file.before,
              )
            : file.before === null || typeof file.before === "string"
              ? file.before
              : (() => {
                    throw new Error(
                        `${path}.files[${JSON.stringify(filePath)}].before must be a string or null`,
                    );
                })();
        if (transitional) {
            const beforeHash = file.beforeHash;
            const beforeBase64 = file.beforeBase64;
            const encodedBefore =
                before === null
                    ? null
                    : Buffer.from(before, "utf8").toString("base64");
            if (
                (beforeHash !== null &&
                    (typeof beforeHash !== "string" ||
                        !/^[a-f0-9]{64}$/u.test(beforeHash))) ||
                (beforeBase64 !== null &&
                    (typeof beforeBase64 !== "string" ||
                        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(
                            beforeBase64,
                        ))) ||
                (before === null &&
                    (beforeHash !== null || beforeBase64 !== null)) ||
                (before !== null &&
                    (beforeHash !== contentHash(before) ||
                        beforeBase64 !== encodedBefore))
            ) {
                throw new Error(
                    `Invalid harness snapshot ${path}: invalid before content integrity`,
                );
            }
        }
        files[filePath] = {
            before,
            afterHash: decodeHash(
                `${path}.files[${JSON.stringify(filePath)}]`,
                file.afterHash,
            ),
        };
        if (
            (complete && files[filePath].afterHash === null) ||
            (!complete && files[filePath].afterHash !== null)
        ) {
            throw new Error(
                `Invalid harness snapshot ${path}: invalid after hash state`,
            );
        }
    }
    return {
        version: SNAPSHOT_VERSION,
        complete,
        modified,
        files,
        ...(metadata ? { metadata } : {}),
    };
};

const persistedSnapshot = (snapshot: HarnessSnapshot): PersistedSnapshot => ({
    version: SNAPSHOT_VERSION,
    complete: snapshot.complete,
    modified: snapshot.modified,
    files: Object.fromEntries(
        Object.entries(snapshot.files).map(([path, file]) => [
            path,
            {
                before: encodeBefore(file.before),
                beforeEncoding: SNAPSHOT_ENCODING,
                afterHash: file.afterHash,
            },
        ]),
    ),
    ...(snapshot.metadata ? { metadata: snapshot.metadata } : {}),
});

const writeSnapshot = (
    ctx: HarnessContext,
    id: string,
    paths: string[],
    snapshot: HarnessSnapshot,
) =>
    writeTextAtomic(
        harnessSnapshotPath(ctx, id, paths),
        JSON.stringify(persistedSnapshot(snapshot), null, 2),
        0o600,
    );

const captureFiles = (paths: string[]) =>
    Object.fromEntries(
        paths.map((path) => [
            path,
            { before: readTextIfExists(path), afterHash: null },
        ]),
    ) as Record<string, HarnessFileSnapshot>;

const cloneSnapshot = (snapshot: HarnessSnapshot): HarnessSnapshot => ({
    version: SNAPSHOT_VERSION,
    complete: snapshot.complete,
    modified: snapshot.modified,
    files: Object.fromEntries(
        Object.entries(snapshot.files).map(([path, file]) => [
            path,
            { ...file },
        ]),
    ),
    ...(snapshot.metadata ? { metadata: { ...snapshot.metadata } } : {}),
});

const restoreFiles = (files: Record<string, HarnessFileSnapshot>) => {
    for (const [path, file] of Object.entries(files)) {
        if (file.before === null) removeIfExists(path);
        else writeTextAtomic(path, file.before);
    }
};

const readSnapshot = (
    ctx: HarnessContext,
    id: string,
    paths: string[],
    managedRoot?: string,
): SnapshotRecord | null => {
    const normalized = normalizedPaths(paths, managedRoot);
    const snapshotPath = harnessSnapshotPath(ctx, id, normalized);
    const text = readTextIfExists(snapshotPath);
    if (text === null) return null;
    return {
        path: snapshotPath,
        text,
        snapshot: parsePersistedSnapshot(
            snapshotPath,
            text,
            normalized,
            managedRoot,
        ),
    };
};

/** Read the persisted pre-setup snapshot for adapters that need ownership data
 * while doing an edited-config cleanup. Parsing is strict and never follows
 * paths supplied by the snapshot itself. */
export const loadHarnessSnapshot = (
    ctx: HarnessContext,
    id: string,
    paths: string[],
    managedRoot?: string,
): HarnessSnapshot | null =>
    readSnapshot(ctx, id, paths, managedRoot)?.snapshot ?? null;

const restorePreviousSnapshot = (path: string, text: string | null) => {
    if (text === null) removeIfExists(path);
    else writeTextAtomic(path, text, 0o600);
};

const rollbackSetup = (
    error: unknown,
    rollback: Record<string, HarnessFileSnapshot>,
    snapshotPath: string,
    previousSnapshot: string | null,
): never => {
    const rollbackErrors: unknown[] = [];
    try {
        restoreFiles(rollback);
    } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
    }
    try {
        restorePreviousSnapshot(snapshotPath, previousSnapshot);
    } catch (snapshotError) {
        rollbackErrors.push(snapshotError);
    }
    if (rollbackErrors.length > 0) {
        throw new AggregateError(
            [error, ...rollbackErrors],
            "Harness setup failed and its config/snapshot could not be restored",
        );
    }
    throw error;
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
    managedRoot?: string,
    metadata?: SnapshotMetadata,
): void => {
    const normalized = normalizedPaths(paths, managedRoot);
    const previous = readSnapshot(ctx, id, normalized, managedRoot);
    const snapshotPath = harnessSnapshotPath(ctx, id, normalized);
    const rollback = captureFiles(normalized);
    const previousSnapshot = previous?.text ?? null;
    const existing = previous?.snapshot;
    const snapshot: HarnessSnapshot = existing
        ? cloneSnapshot(existing)
        : {
              version: SNAPSHOT_VERSION,
              complete: false,
              modified: false,
              files: rollback,
          };

    if (metadata) {
        snapshot.metadata =
            typeof metadata === "function"
                ? metadata(existing?.metadata)
                : { ...existing?.metadata, ...metadata };
    }

    if (existing?.complete) {
        snapshot.modified ||= normalized.some(
            (path) =>
                contentHash(rollback[path].before) !==
                existing.files[path].afterHash,
        );
    }

    if (!existing) {
        try {
            writeSnapshot(ctx, id, normalized, snapshot);
        } catch (error) {
            try {
                removeIfExists(snapshotPath);
            } catch (cleanupError) {
                throw new AggregateError(
                    [error, cleanupError],
                    "Harness setup could not create its snapshot",
                );
            }
            throw error;
        }
    }

    try {
        apply();
    } catch (error) {
        rollbackSetup(error, rollback, snapshotPath, previousSnapshot);
    }

    try {
        for (const path of normalized) {
            snapshot.files[path].afterHash = contentHash(
                readTextIfExists(path),
            );
        }
        snapshot.complete = true;
        writeSnapshot(ctx, id, normalized, snapshot);
    } catch (error) {
        rollbackSetup(error, rollback, snapshotPath, previousSnapshot);
    }
};

/** Put the files back byte-for-byte, unless something else edited them since `on`. */
export const restoreSnapshot = (
    ctx: HarnessContext,
    id: string,
    paths: string[],
    managedRoot?: string,
): RestoreOutcome => {
    const record = readSnapshot(ctx, id, paths, managedRoot);
    if (!record) return "missing";
    const { snapshot } = record;

    // A rerun after a user edit is permanently surgical, even if the rerun
    // subsequently rewrites the Pollinations files back to their old bytes.
    if (snapshot.modified) return "modified";
    if (!snapshot.complete) {
        restoreFiles(snapshot.files);
        removeIfExists(record.path);
        return "restored";
    }

    if (
        Object.entries(snapshot.files).some(
            ([path, file]) =>
                contentHash(readTextIfExists(path)) !== file.afterHash,
        )
    ) {
        return "modified";
    }
    restoreFiles(snapshot.files);
    removeIfExists(record.path);
    return "restored";
};

export const clearSnapshot = (
    ctx: HarnessContext,
    id: string,
    paths: string[],
    managedRoot?: string,
) => {
    const record = readSnapshot(ctx, id, paths, managedRoot);
    if (record) removeIfExists(record.path);
};
