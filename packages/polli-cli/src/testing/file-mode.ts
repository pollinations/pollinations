import { statSync } from "node:fs";
import { expect } from "vitest";

/** Asserts the owner-only mode the CLI writes for secrets.
 *
 * POSIX keeps the requested bits. Windows has no permission bits at all:
 * chmod() there only toggles FILE_ATTRIBUTE_READONLY, so a file the CLI wrote
 * with 0o600 reads back as 0o666 no matter what was asked for. The portable
 * assertion is therefore "the file exists and its mode is what the OS reports",
 * not "the mode is 0o600".
 */
export function expectOwnerOnly(file: string) {
    const mode = statSync(file).mode & 0o777;
    if (process.platform === "win32") {
        expect(mode).toBe(0o666);
        return;
    }
    expect(mode).toBe(0o600);
}

/** Asserts a directory the CLI creates as owner-only. The same Windows caveat
 * applies: 0o700 comes back as 0o666 because the bits are not stored. */
export function expectOwnerOnlyDir(dir: string) {
    const mode = statSync(dir).mode & 0o777;
    if (process.platform === "win32") {
        expect(mode).toBe(0o666);
        return;
    }
    expect(mode).toBe(0o700);
}
