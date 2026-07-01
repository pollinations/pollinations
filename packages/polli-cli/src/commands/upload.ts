import { existsSync, readFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { Command } from "commander";
import { requireKey } from "../lib/api.js";
import { MEDIA_URL } from "../lib/config.js";
import { getOutputMode, printError, printMeta, printInfo } from "../lib/output.js";
import { t } from "../lib/i18n.js";
import { startSpinner, stopSpinner } from "../lib/spinner.js";
import { UploadResponseSchema } from "../lib/validation.js";
import { logActivity } from "../lib/logger.js";

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

export async function uploadFile(
    filePath: string,
    apiKey: string,
): Promise<{ id: string; url: string; contentType: string; size: number; duplicate: boolean }> {
    if (!existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
    }
    const mime =
        MIME_BY_EXT[extname(filePath).toLowerCase()] ||
        "application/octet-stream";
    const form = new FormData();
    form.append(
        "file",
        new Blob([readFileSync(filePath)], { type: mime }),
        basename(filePath),
    );
    const res = await fetch(`${MEDIA_URL}/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
    });
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`${res.status} ${res.statusText}: ${text}`);
    }
    const data = await res.json();
    return UploadResponseSchema.parse(data);
}

export const uploadCommand = new Command("upload")
    .description(
        "Upload a local file to media.pollinations.ai and print its public URL",
    )
    .argument("<file>", "Path to the local file to upload")
    .action(async (file: string) => {
        const key = await requireKey();
        const isHuman = getOutputMode() === "human";

        if (!existsSync(file)) {
            printError(`File not found: ${file}`);
            process.exit(1);
        }

        if (isHuman) startSpinner(t("upload.uploading", { file }));

        try {
            const data = await uploadFile(file, key);
            stopSpinner(true, t("upload.success", { url: data.url }));
            if (isHuman) {
                process.stdout.write(`${data.url}\n`);
                printMeta({
                    id: data.id,
                    contentType: data.contentType,
                    size: data.size,
                    duplicate: data.duplicate,
                });
            } else {
                const output = JSON.stringify(data, null, 2);
                process.stdout.write(`${output}\n`);
            }
            logActivity("upload", { file, id: data.id, size: data.size, duplicate: data.duplicate });
        } catch (err) {
            stopSpinner(false);
            printError(
                err instanceof Error ? err.message : "unknown error",
            );
            process.exit(1);
        }
    });