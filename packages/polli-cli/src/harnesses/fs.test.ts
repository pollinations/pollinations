import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveHomePath } from "./fs.js";

describe("harness home paths", () => {
    const home = resolve("test-home");

    it.each([
        ["~", home],
        ["~/agent", join(home, "agent")],
        ["~\\agent", join(home, "agent")],
        ["~/agent/../config", join(home, "config")],
        ["agent", resolve("agent")],
        [home, home],
        ["~other/agent", resolve("~other/agent")],
        [" ~/agent ", resolve(" ~/agent ")],
    ])("resolves %s without changing caller whitespace rules", (path, expected) => {
        expect(resolveHomePath(home, path)).toBe(expected);
    });
});
