import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { Command } from "commander";
import { requireKey } from "../lib/api.js";
import { MEDIA_URL } from "../lib/config.js";
import { mimeTypeFor } from "../lib/mime.js";
import { fail, getOutputMode, printMeta } from "../lib/output.js";

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
