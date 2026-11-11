import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setKeyOverride } from "../lib/config.js";
import { setOutputMode } from "../lib/output.js";
import { fileNameHeaders, uploadCommand } from "./upload.js";

describe("fileNameHeaders", () => {
    it("always sends the UTF-8 name as an RFC 8187 filename*", () => {
        expect(fileNameHeaders("截图.png")).toEqual({
            "Content-Disposition":
                "attachment; filename*=UTF-8''%E6%88%AA%E5%9B%BE.png",
        });
        expect(fileNameHeaders("it's (1)*.png")["Content-Disposition"]).toBe(
            "attachment; filename*=UTF-8''it%27s%20%281%29%2A.png",
        );
    });

    it("keeps X-File-Name only for names that are valid header values", () => {
        expect(fileNameHeaders("photo.png")["X-File-Name"]).toBe("photo.png");
        expect(fileNameHeaders("résumé.png")["X-File-Name"]).toBe("résumé.png");
        expect(fileNameHeaders("photo 📷.png")).not.toHaveProperty(
            "X-File-Name",
        );
    });
});

describe("upload command", () => {
    let dir: string | undefined;

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        setKeyOverride(undefined);
        setOutputMode("human");
        if (dir) rmSync(dir, { recursive: true, force: true });
        dir = undefined;
    });

    it.skipIf(process.platform === "win32")(
        "uploads nonempty named pipes with their actual byte length",
        async () => {
            dir = mkdtempSync(join(tmpdir(), "polli-upload-"));
            const pipe = join(dir, "input.txt");
            execFileSync("mkfifo", [pipe]);
            const payload = Buffer.from("hello from a pipe 🌸\n", "utf8");
            setKeyOverride("sk_test");
            setOutputMode("json");
            vi.spyOn(process.stdout, "write").mockImplementation(() => true);
            let sent: Headers | undefined;
            let body: Buffer | undefined;
            vi.stubGlobal(
                "fetch",
                async (url: string, init: RequestInit & { duplex: "half" }) => {
                    const request = new Request(url, init);
                    sent = request.headers;
                    body = Buffer.from(await request.arrayBuffer());
                    return Response.json({
                        id: "id",
                        url: "https://media.pollinations.ai/id",
                        contentType: "text/plain",
                        size: payload.byteLength,
                    });
                },
            );
            const writer = spawn(process.execPath, [
                "-e",
                "require('node:fs').writeFileSync(process.argv[1], process.argv[2])",
                pipe,
                payload.toString("utf8"),
            ]);
            try {
                await uploadCommand.parseAsync([pipe], { from: "user" });

                expect(body).toEqual(payload);
                // Content-Length counts transmitted octets, not UTF-8 characters
                // or the FIFO's stat size.
                expect(sent?.get("content-length")).toBe(
                    String(payload.byteLength),
                );
            } finally {
                writer.kill();
            }
        },
    );

    for (const name of ["截图.png", "photo 📷.png", "résumé.png", "a.png"]) {
        it(`streams ${name} with headers that fetch accepts`, async () => {
            dir = mkdtempSync(join(tmpdir(), "polli-upload-"));
            const file = join(dir, name);
            writeFileSync(file, "png-bytes");
            setKeyOverride("sk_test");
            setOutputMode("json");
            vi.spyOn(process.stdout, "write").mockImplementation(() => true);
            let sent: Headers | undefined;
            let body = "";
            vi.stubGlobal(
                "fetch",
                async (url: string, init: RequestInit & { duplex: "half" }) => {
                    // A real Request validates headers exactly like fetch does.
                    const request = new Request(url, init);
                    sent = request.headers;
                    body = await request.text();
                    return Response.json({
                        id: "id",
                        url: "https://media.pollinations.ai/id",
                        contentType: "image/png",
                        size: 9,
                    });
                },
            );

            await uploadCommand.parseAsync([file], { from: "user" });

            expect(body).toBe("png-bytes");
            const encoded = sent
                ?.get("content-disposition")
                ?.match(/filename\*=UTF-8''(.+)$/)?.[1];
            expect(decodeURIComponent(encoded ?? "")).toBe(name);
        });
    }
});
