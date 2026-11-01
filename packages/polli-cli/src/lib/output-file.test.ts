import {
    mkdirSync,
    mkdtempSync,
    rmSync,
    statSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareOutputPath } from "./output-file.js";

const folders: string[] = [];

function tempFolder(): string {
    const folder = mkdtempSync(join(tmpdir(), "polli-output-path-"));
    folders.push(folder);
    return folder;
}

/** The CLI reports through stderr; keep it out of the test output. */
function captureErrors(): string[] {
    const errors: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((value) => {
        errors.push(String(value));
        return true;
    });
    return errors;
}

afterEach(() => {
    vi.restoreAllMocks();
    for (const folder of folders.splice(0)) rmSync(folder, { recursive: true });
});

describe("prepareOutputPath", () => {
    it("creates a missing parent directory", () => {
        captureErrors();
        const folder = tempFolder();

        prepareOutputPath(join(folder, "nested", "deeper", "reply.txt"));

        expect(statSync(join(folder, "nested", "deeper")).isDirectory()).toBe(
            true,
        );
    });

    it("accepts a path that does not exist yet", () => {
        captureErrors();

        expect(() =>
            prepareOutputPath(join(tempFolder(), "reply.txt")),
        ).not.toThrow();
    });

    it("accepts a path naming an existing file", () => {
        captureErrors();
        const file = join(tempFolder(), "reply.txt");
        writeFileSync(file, "older response");

        expect(() => prepareOutputPath(file)).not.toThrow();
    });

    it("rejects an existing directory before a request can be paid for", () => {
        const errors = captureErrors();
        const directory = join(tempFolder(), "existing-directory");
        mkdirSync(directory);

        expect(() => prepareOutputPath(directory)).toThrow();

        expect(errors.join("")).toContain("it is a directory, not a file");
    });
});
