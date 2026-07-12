import { existsSync, readFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { Command } from "commander";
import { requireKey } from "../lib/api.js";
import { MEDIA_URL } from "../lib/config.js";
import { getOutputMode, printError, printMeta } from "../lib/output.js";

const MIME_BY_EXT: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".bmp": "image/bmp",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".m4a": "audio/mp4",
    ".flac": "audio/flac",
    ".aac": "audio/aac",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
};

interface UploadResponse {
    id: string;
    url: string;
    contentType: string;
    size: number;
    duplicate: boolean;
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
            printError(`File not found: ${file}`);
            process.exit(1);
        }

        const mime =
            MIME_BY_EXT[extname(file).toLowerCase()] ||
            "application/octet-stream";
        const form = new FormData();
        form.append(
            "file",
            new Blob([readFileSync(file)], { type: mime }),
            basename(file),
        );

        const res = await fetch(`${MEDIA_URL}/upload`, {
            method: "POST",
            headers: { Authorization: `Bearer ${key}` },
            body: form,
        });

        if (!res.ok) {
            const text = await res.text().catch(() => "");
            printError(`${res.status} ${res.statusText}: ${text}`);
            process.exit(1);
        }

        const data = (await res.json()) as UploadResponse;

        if (isHuman) {
            process.stdout.write(`${data.url}\n`);
            printMeta({
                id: data.id,
                contentType: data.contentType,
                size: data.size,
                duplicate: data.duplicate,
            });
        } else {
            process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
        }
    });
