import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assetType, collectSiteFiles } from "./sites.js";

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
            { hash: expect.stringMatching(/^[0-9a-f]{32}$/), size: 11 },
        );
    });

    it("hashes the same bytes apart when the file types differ", () => {
        dir = mkdtempSync(join(tmpdir(), "polli-site-"));
        write("index.html", "same");
        write("app.js", "same");
        write("app.txt", "same");

        const hashes = new Set(collectSiteFiles(dir).map((file) => file.hash));

        expect(hashes.size).toBe(3);
    });
});

describe("assetType", () => {
    it("sends unknown types without a Content-Type", () => {
        expect(assetType("index.html")).toBe("text/html");
        expect(assetType("logo.PNG")).toBe("image/png");
        expect(assetType("data.unknown")).toBe("application/null");
    });
});
