import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { collectSiteFiles } from "./sites.js";

describe("collectSiteFiles", () => {
    let dir: string;
    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    const write = (path: string, content: string) => {
        mkdirSync(dirname(join(dir, path)), { recursive: true });
        writeFileSync(join(dir, path), content);
    };

    it("lists published files as manifest paths, keeping secrets local", () => {
        dir = mkdtempSync(join(tmpdir(), "polli-site-"));
        write("index.html", "<h1>hi</h1>");
        write("assets/app.js", "console.log(1)");
        write(".well-known/security.txt", "Contact: x");
        write(".env", "SECRET=1");
        write(".git/config", "[core]");
        write("node_modules/lib/index.js", "module.exports = 1");

        const files = collectSiteFiles(dir);

        expect(files.map((file) => file.path).sort()).toEqual([
            "/.well-known/security.txt",
            "/assets/app.js",
            "/index.html",
        ]);
        expect(files.find((file) => file.path === "/index.html")).toMatchObject(
            {
                hash: createHash("sha256")
                    .update("<h1>hi</h1>")
                    .digest("hex")
                    .slice(0, 32),
                size: 11,
            },
        );
    });
});
