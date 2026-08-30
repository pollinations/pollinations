import { createHash } from "node:crypto";
import {
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeTextAtomic } from "./fs.js";
import {
    applyWithSnapshot,
    harnessSnapshotPath,
    loadHarnessSnapshot,
    restoreSnapshot,
} from "./snapshot.js";
import type { HarnessContext } from "./types.js";

let home: string;
let ctx: HarnessContext;
let target: string;

beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "polli-snapshot-"));
    ctx = { home, env: {} };
    target = join(home, "agent", "config.json");
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

const managed = () => [target];

describe("harness snapshots", () => {
    it("persists a strict schema with encoded content and hashes", () => {
        mkdirSync(join(home, "agent"), { recursive: true });
        writeFileSync(target, "before\n", { encoding: "utf8" });
        applyWithSnapshot(ctx, "test", managed(), () =>
            writeTextAtomic(target, "after\n"),
        );

        const path = harnessSnapshotPath(ctx, "test", managed());
        const persisted = JSON.parse(readFileSync(path, "utf8")) as {
            version: number;
            complete: boolean;
            modified: boolean;
            files: Record<
                string,
                { before: string; beforeEncoding: string; afterHash: string }
            >;
        };
        expect(persisted).toMatchObject({
            version: 1,
            complete: true,
            modified: false,
        });
        expect(persisted.files[target]).toMatchObject({
            before: Buffer.from("before\n").toString("base64"),
            beforeEncoding: "base64",
        });
        expect(persisted.files[target].afterHash).toMatch(/^[a-f0-9]{64}$/u);
        expect(loadHarnessSnapshot(ctx, "test", managed())).toMatchObject({
            complete: true,
            files: { [target]: { before: "before\n" } },
        });
    });

    it("keeps edits sticky across a rerun and refuses byte restoration", () => {
        applyWithSnapshot(ctx, "test", managed(), () =>
            writeTextAtomic(target, "managed one"),
        );
        writeFileSync(target, "user edit");
        applyWithSnapshot(ctx, "test", managed(), () =>
            writeTextAtomic(target, "managed two"),
        );

        expect(loadHarnessSnapshot(ctx, "test", managed())).toMatchObject({
            modified: true,
        });
        expect(restoreSnapshot(ctx, "test", managed())).toBe("modified");
        expect(readFileSync(target, "utf8")).toBe("managed two");
    });

    it("restores the prior snapshot when a rerun fails", () => {
        applyWithSnapshot(ctx, "test", managed(), () =>
            writeTextAtomic(target, "managed"),
        );
        const path = harnessSnapshotPath(ctx, "test", managed());
        const before = readFileSync(path, "utf8");
        writeFileSync(target, "user edit");

        expect(() =>
            applyWithSnapshot(ctx, "test", managed(), () => {
                writeTextAtomic(target, "partial");
                throw new Error("setup failed");
            }),
        ).toThrow("setup failed");
        expect(readFileSync(target, "utf8")).toBe("user edit");
        expect(readFileSync(path, "utf8")).toBe(before);
    });

    it("rejects snapshots whose managed paths or schema are altered", () => {
        const path = harnessSnapshotPath(ctx, "test", managed());
        writeTextAtomic(
            path,
            JSON.stringify({
                version: 1,
                complete: true,
                modified: false,
                files: {
                    [join(home, "other.json")]: {
                        before: null,
                        beforeEncoding: "base64",
                        afterHash: null,
                    },
                },
            }),
        );
        expect(() => loadHarnessSnapshot(ctx, "test", managed())).toThrow(
            /managed paths changed/,
        );

        writeTextAtomic(
            path,
            JSON.stringify({
                version: 1,
                complete: true,
                modified: false,
                extra: true,
                files: {
                    [target]: {
                        before: null,
                        beforeEncoding: "base64",
                        afterHash: null,
                    },
                },
            }),
        );
        expect(() => loadHarnessSnapshot(ctx, "test", managed())).toThrow(
            /unexpected schema/,
        );
    });

    it("restores origin snapshots that predate the strict encoded schema", () => {
        const before = "legacy before\n";
        mkdirSync(join(home, "agent"), { recursive: true });
        writeFileSync(target, before);
        const afterHash = createHash("sha256")
            .update("legacy after")
            .digest("hex");
        writeTextAtomic(
            harnessSnapshotPath(ctx, "test", managed()),
            JSON.stringify({
                complete: true,
                files: { [target]: { before, afterHash } },
            }),
        );
        writeFileSync(target, "legacy after");

        expect(restoreSnapshot(ctx, "test", managed())).toBe("restored");
        expect(readFileSync(target, "utf8")).toBe(before);
    });

    it("reads the Prime transitional integrity schema and restores it", () => {
        const before = "prime before\n";
        const after = "prime after\n";
        mkdirSync(join(home, "agent"), { recursive: true });
        writeFileSync(target, after);
        writeTextAtomic(
            harnessSnapshotPath(ctx, "test", managed()),
            JSON.stringify({
                version: 1,
                complete: true,
                modified: false,
                files: {
                    [target]: {
                        before,
                        afterHash: createHash("sha256")
                            .update(after)
                            .digest("hex"),
                        beforeHash: createHash("sha256")
                            .update(before)
                            .digest("hex"),
                        beforeBase64: Buffer.from(before).toString("base64"),
                    },
                },
            }),
        );

        expect(restoreSnapshot(ctx, "test", managed())).toBe("restored");
        expect(readFileSync(target, "utf8")).toBe(before);
    });

    it("preserves metadata owned by earlier setup passes", () => {
        applyWithSnapshot(
            ctx,
            "test",
            managed(),
            () => writeTextAtomic(target, "first"),
            undefined,
            { owner: "first" },
        );
        applyWithSnapshot(
            ctx,
            "test",
            managed(),
            () => writeTextAtomic(target, "second"),
            undefined,
            (existing) => ({ ...existing, current: "second" }),
        );

        expect(loadHarnessSnapshot(ctx, "test", managed())).toMatchObject({
            metadata: { owner: "first", current: "second" },
        });
    });
});
