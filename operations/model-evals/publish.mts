/**
 * Publish a finished run to the `news` branch.
 *
 * The model-monitor site is a static Cloudflare Pages build, and the deployments
 * of that app only run when the `production` branch moves, so eval results cannot
 * be baked in at build time. The repository already solved this for the news
 * data: generated files are committed to the `news` branch and read at runtime
 * from raw.githubusercontent.com. This follows the same path, through the
 * Contents API with the workflow's app token.
 *
 * Usage:
 *   GITHUB_TOKEN=... GITHUB_REPOSITORY=owner/repo \
 *     node operations/model-evals/publish.mts --source <dir> [--dest <dir>] [--branch news]
 */

import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";

import type { FetchLike } from "./src/catalog.mts";

export const DEFAULT_BRANCH = "news";
export const DEFAULT_DEST = "operations/model-evals";
export const PUBLISH_FILES = ["latest.json", "history.json"] as const;

export const USAGE = `Usage: node operations/model-evals/publish.mts --source <dir> [--dest <dir>] [--branch <branch>] [--message <text>]

Environment:
  GITHUB_TOKEN         Required; needs contents: write
  GITHUB_REPOSITORY    Required; owner/repo
  GITHUB_API_URL       Optional API host (default: https://api.github.com)`;

export type PublishOptions = {
    source: string;
    dest: string;
    branch: string;
    message: string | null;
    files: string[];
    help: boolean;
};

export function parseArgs(argv: readonly string[]): PublishOptions {
    const options: PublishOptions = {
        source: "",
        dest: DEFAULT_DEST,
        branch: DEFAULT_BRANCH,
        message: null,
        files: [...PUBLISH_FILES],
        help: false,
    };
    const valueFlags = new Set([
        "--source",
        "--dest",
        "--branch",
        "--message",
        "--files",
    ]);
    for (let index = 0; index < argv.length; index += 1) {
        const flag = argv[index];
        if (flag === "--help" || flag === "-h") {
            options.help = true;
            continue;
        }
        if (!valueFlags.has(flag)) {
            throw new Error(`Unknown argument: ${flag}\n${USAGE}`);
        }
        const value = argv[index + 1];
        if (value === undefined || value.startsWith("--")) {
            throw new Error(`${flag} needs a value\n${USAGE}`);
        }
        index += 1;
        if (flag === "--source") {
            options.source = value;
        } else if (flag === "--dest") {
            options.dest = value.replace(/^\/+|\/+$/g, "");
        } else if (flag === "--branch") {
            options.branch = value;
        } else if (flag === "--message") {
            options.message = value;
        } else {
            options.files = value
                .split(",")
                .map((name) => name.trim())
                .filter(Boolean);
        }
    }
    if (!options.source) {
        throw new Error(`--source is required\n${USAGE}`);
    }
    return options;
}

type ContentsResponse = { sha?: unknown };

export function buildContentsUrl(
    apiUrl: string,
    repository: string,
    path: string,
): string {
    const cleanApi = apiUrl.replace(/\/+$/g, "");
    const encodedPath = path
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/");
    return `${cleanApi}/repos/${repository}/contents/${encodedPath}`;
}

export function buildPublishBody(options: {
    content: string;
    message: string;
    branch: string;
    sha?: string | null;
}): Record<string, string> {
    const body: Record<string, string> = {
        message: options.message,
        content: Buffer.from(options.content, "utf8").toString("base64"),
        branch: options.branch,
    };
    if (options.sha) {
        body.sha = options.sha;
    }
    return body;
}

/** Reads the current blob sha, so an update replaces the file instead of failing. */
async function readRemoteSha(
    url: string,
    token: string,
    fetchImpl: FetchLike,
): Promise<{ sha: string | null; error: string | null }> {
    const response = await fetchImpl(url, {
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "User-Agent": "pollinations-model-evals",
        },
    });
    if (response.status === 404) {
        return { sha: null, error: null };
    }
    if (!response.ok) {
        return { sha: null, error: `HTTP ${response.status}` };
    }
    const payload = (await response.json()) as ContentsResponse;
    return {
        sha: typeof payload.sha === "string" ? payload.sha : null,
        error: null,
    };
}

export async function publishFiles(options: {
    options: PublishOptions;
    token: string;
    repository: string;
    apiUrl?: string;
    fetchImpl?: FetchLike;
    log?: (message: string) => void;
}): Promise<{ published: string[]; failed: string[] }> {
    const fetchImpl = options.fetchImpl ?? fetch;
    const apiUrl = options.apiUrl ?? "https://api.github.com";
    const log = options.log ?? (() => {});
    const published: string[] = [];
    const failed: string[] = [];

    for (const file of options.options.files) {
        const localPath = join(options.options.source, file);
        let content: string;
        try {
            content = await readFile(localPath, "utf8");
        } catch {
            log(`skip ${file}: not found in ${options.options.source}`);
            continue;
        }
        const remotePath = options.options.dest
            ? `${options.options.dest}/${basename(file)}`
            : basename(file);
        const url = buildContentsUrl(apiUrl, options.repository, remotePath);
        const remote = await readRemoteSha(url, options.token, fetchImpl);
        if (remote.error) {
            log(
                `fail ${remotePath}: could not read the current file (${remote.error})`,
            );
            failed.push(remotePath);
            continue;
        }
        const response = await fetchImpl(url, {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${options.token}`,
                Accept: "application/vnd.github+json",
                "Content-Type": "application/json",
                "User-Agent": "pollinations-model-evals",
            },
            body: JSON.stringify(
                buildPublishBody({
                    content,
                    message:
                        options.options.message ??
                        `evals: publish ${basename(file)}`,
                    branch: options.options.branch,
                    sha: remote.sha,
                }),
            ),
        });
        if (!response.ok) {
            log(`fail ${remotePath}: HTTP ${response.status}`);
            failed.push(remotePath);
            continue;
        }
        log(`published ${remotePath} to ${options.options.branch}`);
        published.push(remotePath);
    }

    return { published, failed };
}

export async function main(
    argv: readonly string[],
    env: Record<string, string | undefined> = process.env,
): Promise<number> {
    const options = parseArgs(argv);
    if (options.help) {
        console.log(USAGE);
        return 0;
    }
    const token = env.GITHUB_TOKEN ?? "";
    const repository = env.GITHUB_REPOSITORY ?? "";
    if (!token || !repository) {
        console.error("GITHUB_TOKEN and GITHUB_REPOSITORY are required.");
        return 1;
    }
    const result = await publishFiles({
        options,
        token,
        repository,
        apiUrl: env.GITHUB_API_URL,
        log: (message) => console.log(message),
    });
    if (result.published.length === 0 && result.failed.length === 0) {
        console.error("Nothing to publish.");
        return 1;
    }
    return result.failed.length > 0 ? 1 : 0;
}

if (
    process.argv[1] &&
    import.meta.url === pathToFileURL(process.argv[1]).href
) {
    main(process.argv.slice(2))
        .then((code) => {
            process.exitCode = code;
        })
        .catch((error: unknown) => {
            console.error(
                error instanceof Error ? error.message : String(error),
            );
            process.exitCode = 1;
        });
}
