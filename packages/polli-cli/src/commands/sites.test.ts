import {
    mkdirSync,
    mkdtempSync,
    rmSync,
    symlinkSync,
    writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assetType, collectSiteFiles, verifySiteFiles } from "./sites.js";

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

    it("publishes links that stay inside the folder, under the linked name", () => {
        dir = mkdtempSync(join(tmpdir(), "polli-site-"));
        write("index.html", "<h1>hi</h1>");
        write("shared/logo.svg", "<svg/>");
        symlinkSync(join(dir, "shared/logo.svg"), join(dir, "logo.svg"));
        symlinkSync(join(dir, "shared"), join(dir, "assets"));

        const files = collectSiteFiles(dir);

        // One target, three URL paths — every name the build references is served.
        expect(files.map((file) => file.path).sort()).toEqual([
            "/assets/logo.svg",
            "/index.html",
            "/logo.svg",
            "/shared/logo.svg",
        ]);
        // The linked name is the URL path, and the bytes are read through the link.
        expect(files.find((file) => file.path === "/logo.svg")).toMatchObject({
            size: 6,
        });
    });

    it("leaves out links that escape the folder or point nowhere, and says why", () => {
        dir = mkdtempSync(join(tmpdir(), "polli-site-"));
        const outside = mkdtempSync(join(tmpdir(), "polli-outside-"));
        writeFileSync(join(outside, "secret.txt"), "not for the site");
        write("index.html", "<h1>hi</h1>");
        symlinkSync(join(outside, "secret.txt"), join(dir, "secret.txt"));
        symlinkSync(outside, join(dir, "outside"));
        symlinkSync(join(dir, "missing.bin"), join(dir, "gone.bin"));
        symlinkSync(join(dir, "self"), join(dir, "self"));

        const skipped: Record<string, string> = {};
        const files = collectSiteFiles(dir, (file, reason) => {
            skipped[file.replace(dir, "")] = reason;
        });

        expect(files.map((file) => file.path)).toEqual(["/index.html"]);
        expect(skipped).toEqual({
            "/gone.bin": "points nowhere",
            "/outside": "points outside the folder",
            "/secret.txt": "points outside the folder",
            "/self": "points nowhere",
        });
        rmSync(outside, { recursive: true, force: true });
    });

    it("stops at a folder link that loops back into the published tree", () => {
        dir = mkdtempSync(join(tmpdir(), "polli-site-"));
        write("index.html", "<h1>hi</h1>");
        symlinkSync(dir, join(dir, "loop"));

        const skipped: string[] = [];
        const files = collectSiteFiles(dir, (_file, reason) =>
            skipped.push(reason),
        );

        expect(files.map((file) => file.path)).toEqual(["/index.html"]);
        expect(skipped).toEqual(["links back to a folder it sits inside"]);
    });
});

describe("assetType", () => {
    it("sends unknown types without a Content-Type", () => {
        expect(assetType("index.html")).toBe("text/html");
        expect(assetType("logo.PNG")).toBe("image/png");
        expect(assetType("data.unknown")).toBe("application/null");
    });
});

describe("verifySiteFiles", () => {
    it("follows redirects, retries and checks binary filenames without sending credentials", async () => {
        const dir = mkdtempSync(join(tmpdir(), "polli-verify-"));
        const html = Buffer.from("<h1>hello</h1>");
        const image = Buffer.from([0, 255, 128, 10]);
        const responses = new Map([
            ["/", html],
            ["/cat%25%2B.png", image],
        ]);
        writeFileSync(join(dir, "index.html"), html);
        writeFileSync(join(dir, "cat%+.png"), image);
        const requests: { path: string; authorization?: string }[] = [];
        const server = createServer((req, res) => {
            const path = req.url ?? "/";
            requests.push({ path, authorization: req.headers.authorization });
            if (requests.length === 1) {
                res.writeHead(503).end();
            } else if (path === "/index.html") {
                res.writeHead(301, { Location: "/" }).end();
            } else {
                const bytes = responses.get(path);
                res.writeHead(bytes ? 200 : 404).end(bytes);
            }
        });
        try {
            await new Promise<void>((resolve) =>
                server.listen(0, "127.0.0.1", resolve),
            );
            const { port } = server.address() as AddressInfo;
            await verifySiteFiles(
                collectSiteFiles(dir),
                `http://127.0.0.1:${port}`,
                0,
            );
            expect(requests.some(({ path }) => path === "/cat%25%2B.png")).toBe(
                true,
            );
            expect(requests).toHaveLength(4);
            expect(requests.some(({ path }) => path === "/")).toBe(true);
            expect(
                requests.every(
                    ({ authorization }) => authorization === undefined,
                ),
            ).toBe(true);
        } finally {
            server.closeAllConnections();
            await new Promise<void>((resolve) => server.close(() => resolve()));
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it.each([404, 200])(
        "fails when a file stays unavailable or serves SPA fallback (HTTP %i)",
        async (status) => {
            const dir = mkdtempSync(join(tmpdir(), "polli-verify-"));
            writeFileSync(join(dir, "app.js"), "console.log('app')");
            let requests = 0;
            const server = createServer((_req, res) => {
                requests++;
                res.writeHead(status).end("<h1>fallback</h1>");
            });
            try {
                await new Promise<void>((resolve) =>
                    server.listen(0, "127.0.0.1", resolve),
                );
                const { port } = server.address() as AddressInfo;
                await expect(
                    verifySiteFiles(
                        collectSiteFiles(dir),
                        `http://127.0.0.1:${port}`,
                        0,
                    ),
                ).rejects.toThrow(
                    `Verification failed for /app.js: ${status === 404 ? "HTTP 404" : "deployed bytes differ from the local file"}`,
                );
                expect(requests).toBe(6);
            } finally {
                server.closeAllConnections();
                await new Promise<void>((resolve) =>
                    server.close(() => resolve()),
                );
                rmSync(dir, { recursive: true, force: true });
            }
        },
    );
});
