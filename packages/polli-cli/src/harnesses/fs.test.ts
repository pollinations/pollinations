import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveHarnessPath } from "./fs.js";

describe("resolveHarnessPath", () => {
    const home = resolve("test-home");

    it("expands the supported home-relative forms", () => {
        expect(resolveHarnessPath("~", home)).toBe(home);
        expect(resolveHarnessPath("~/nested", home)).toBe(
            resolve(home, "nested"),
        );
        expect(resolveHarnessPath("~\\nested", home)).toBe(
            resolve(home, "nested"),
        );
    });

    it("resolves raw paths without treating a leading tilde as a shell alias", () => {
        const raw = "relative/harness";
        expect(resolveHarnessPath(raw, home)).toBe(resolve(raw));
    });
});
