import { createReadStream, existsSync, statSync } from "node:fs";
import { basename } from "node:path";
import { Command } from "commander";
import { requireKey } from "../lib/api.js";
import { MEDIA_URL } from "../lib/config.js";
import { mimeTypeFor } from "../lib/mime.js";
import { fail, getOutputMode, printMeta } from "../lib/output.js";

/** Percent-encode a value for an RFC 8187 `filename*` parameter. */
const encodeExtValue = (value: string) =>
    encodeURIComponent(value).replace(
        /['()*]/g,
        (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
    );

/** Characters a header value can carry as-is (printable Latin-1). */
const HEADER_SAFE = /^[\x20-\x7e\xa0-\xff]*$/;

/**
 * Headers that carry the original filename. Header values must be byte
 * strings, so a raw `X-File-Name` with CJK or emoji makes fetch throw before
 * anything is sent. The UTF-8 name always travels in `Content-Disposition`
 * (RFC 8187 `filename*`). `X-File-Name` is still sent when the name fits in
 * a header, so older media servers keep the name too.
 */
export const fileNameHeaders = (name: string): Record<string, string> => ({
    "Content-Disposition": `attachment; filename*=UTF-8''${encodeExtValue(name)}`,
    ...(HEADER_SAFE.test(name) && { "X-File-Name": name }),
});

interface UploadResponse {
    id: string;
    url: string;
    contentType: string;
    size: number;
}

export const uploadCommand = new Command("upload")
    .description(
        "Upload a local file to media.pollinations.ai and print its public URL",
    )
    .argument("<file>", "Path to the local file to upload")
    .action(async (file: string) => {
        const key = requireKey();
        const isHuman = getOutputMode() === "human";

        if (!existsSync(file)) {
            fail(`File not found: ${file}`);
        }

        const mime = mimeTypeFor(file);
        const size = statSync(file).size;

        const uploadRequest: RequestInit & { duplex: "half" } = {
            method: "POST",
            headers: {
                Authorization: `Bearer ${key}`,
                "Content-Type": mime,
                "Content-Length": String(size),
                ...fileNameHeaders(basename(file)),
            },
            body: createReadStream(file) as unknown as BodyInit,
            duplex: "half",
        };
        const res = await fetch(`${MEDIA_URL}/upload`, uploadRequest);

        if (!res.ok) {
            const text = await res.text().catch(() => "");
            fail(`${res.status} ${res.statusText}: ${text}`);
        }

        const data = (await res.json()) as UploadResponse;

        if (isHuman) {
            process.stdout.write(`${data.url}\n`);
            printMeta({
                id: data.id,
                contentType: data.contentType,
                size: data.size,
            });
        } else {
            process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
        }
    });
