import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, resolve, sep } from "node:path";
import chalk from "chalk";
import { Command } from "commander";
import { gen, requireKey } from "../lib/api.js";
import { mimeTypeFor } from "../lib/mime.js";
import {
    ExitSignal,
    getOutputMode,
    printError,
    printInfo,
    printResult,
    printSuccess,
    printTable,
} from "../lib/output.js";

type Site = {
    name: string;
    url: string;
    createdAt: string;
    publishedAt: string | null;
    blocked: boolean;
};

type UploadSession = {
    uploadUrl: string;
    jwt: string;
    buckets: string[][];
};

export type SiteFile = {
    path: string;
    file: string;
    hash: string;
    size: number;
};

/** Every file under `dir` as Cloudflare's upload manifest describes it: the
 * URL path, a hash and the size. As in Cloudflare's example, the hash covers
 * the base64 content plus the extension, so the same bytes as .js and .txt
 * upload separately with their own types. Dotfiles (.env, .git) and
 * node_modules stay local; .well-known is published. */
export function collectSiteFiles(dir: string): SiteFile[] {
    const files: SiteFile[] = [];
    const walk = (current: string) => {
        for (const entry of readdirSync(current, { withFileTypes: true })) {
            const skipped =
                (entry.name.startsWith(".") && entry.name !== ".well-known") ||
                entry.name === "node_modules";
            if (skipped) continue;
            const file = join(current, entry.name);
            if (entry.isDirectory()) walk(file);
            else if (entry.isFile()) {
                const content = readFileSync(file);
                files.push({
                    path: `/${relative(dir, file).split(sep).join("/")}`,
                    file,
                    hash: createHash("sha256")
                        .update(
                            content.toString("base64") + extname(file).slice(1),
                        )
                        .digest("hex")
                        .slice(0, 32),
                    size: content.length,
                });
            }
        }
    };
    walk(dir);
    return files;
}

/** As wrangler uploads assets, an unknown type is sent as "application/null",
 * which serves no Content-Type instead of forcing a download. */
export function assetType(file: string) {
    const type = mimeTypeFor(file);
    return type === "application/octet-stream" ? "application/null" : type;
}

/** Uploads each bucket straight to Cloudflare and returns the completion JWT. */
async function uploadBuckets(session: UploadSession, files: SiteFile[]) {
    const byHash = new Map(files.map((file) => [file.hash, file]));
    let jwt = session.jwt;
    for (const bucket of session.buckets) {
        const form = new FormData();
        for (const hash of bucket) {
            const file = byHash.get(hash);
            if (!file)
                throw new Error(`Cloudflare asked for unknown file ${hash}`);
            form.append(
                hash,
                new Blob([readFileSync(file.file).toString("base64")], {
                    type: assetType(file.file),
                }),
                hash,
            );
        }
        const response = await fetch(session.uploadUrl, {
            method: "POST",
            headers: { Authorization: `Bearer ${session.jwt}` },
            body: form,
        });
        const body = (await response.json().catch(() => null)) as {
            success?: boolean;
            result?: { jwt?: string };
            errors?: { message?: string }[];
        } | null;
        if (!response.ok || !body?.success) {
            const reason = body?.errors
                ?.map((error) => error.message)
                .join("; ");
            throw new Error(
                `Upload failed (${response.status})${reason ? `: ${reason}` : ""}`,
            );
        }
        if (body.result?.jwt) jwt = body.result.jwt;
    }
    return jwt;
}

const errorMessage = (error: unknown) =>
    error instanceof Error ? error.message : "unknown";

const deploy = new Command("deploy")
    .description(
        "Publish a folder of static files (with an index.html) at https://<name>.pollinations.app",
    )
    .argument("[dir]", "Folder to publish, e.g. your build output", ".")
    .requiredOption(
        "--name <name>",
        "Site name: 3-32 lowercase letters, digits and hyphens",
    )
    .action(async (dir: string, opts: { name: string }) => {
        const key = requireKey();
        const files = collectSiteFiles(resolve(dir));
        const manifest = Object.fromEntries(
            files.map((file) => [
                file.path,
                { hash: file.hash, size: file.size },
            ]),
        );
        try {
            const path = `/account/sites/${encodeURIComponent(opts.name)}`;
            const session = await gen<UploadSession>(`${path}/upload`, {
                method: "POST",
                body: { manifest },
                apiKey: key,
            });
            const jwt = await uploadBuckets(session, files);
            const site = await gen<Site>(path, {
                method: "PUT",
                body: { jwt },
                apiKey: key,
            });
            if (getOutputMode() === "json") {
                printResult(site);
                return;
            }
            const uploaded = session.buckets.flat().length;
            printSuccess(`Published ${site.url}`);
            printInfo(
                `${files.length} files, ${uploaded} uploaded, ${files.length - uploaded} unchanged`,
            );
        } catch (error) {
            printError(`Failed to deploy site: ${errorMessage(error)}`);
            throw new ExitSignal(1);
        }
    });

const list = new Command("list")
    .description("List your sites")
    .action(async () => {
        const key = requireKey();
        try {
            const { data } = await gen<{ data: Site[] }>("/account/sites", {
                apiKey: key,
            });
            if (getOutputMode() === "json") {
                printResult(data);
                return;
            }
            printTable(
                data.map((site) => ({
                    name: site.name,
                    url: site.blocked
                        ? chalk.red("taken down")
                        : site.publishedAt
                          ? site.url
                          : chalk.dim("not published"),
                    published: site.publishedAt ?? "-",
                })),
                ["name", "url", "published"],
            );
        } catch (error) {
            printError(`Failed to list sites: ${errorMessage(error)}`);
            throw new ExitSignal(1);
        }
    });

const remove = new Command("delete")
    .description("Take a site offline and free its name")
    .argument("<name>", "Site name")
    .action(async (name: string) => {
        const key = requireKey();
        try {
            await gen(`/account/sites/${encodeURIComponent(name)}`, {
                method: "DELETE",
                apiKey: key,
            });
            printSuccess(`Site deleted: ${name}`);
        } catch (error) {
            printError(`Failed to delete site: ${errorMessage(error)}`);
            throw new ExitSignal(1);
        }
    });

export const sitesCommand = new Command("sites")
    .description("Host static sites at <name>.pollinations.app")
    .addCommand(deploy)
    .addCommand(list)
    .addCommand(remove);
