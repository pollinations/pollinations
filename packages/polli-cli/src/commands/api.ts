import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { Command } from "commander";
import { ApiError } from "../lib/api.js";
import { BASE_URL, resolveApiKey } from "../lib/config.js";
import { fail, getOutputMode, printMeta, printResult } from "../lib/output.js";
import { readStdin } from "../lib/stdin.js";

const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

const MIME_BY_EXT: Record<string, string> = {
    ".aac": "audio/aac",
    ".flac": "audio/flac",
    ".gif": "image/gif",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".m4a": "audio/mp4",
    ".mov": "video/quicktime",
    ".mp3": "audio/mpeg",
    ".mp4": "video/mp4",
    ".ogg": "audio/ogg",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".wav": "audio/wav",
    ".webm": "video/webm",
    ".webp": "image/webp",
};

export interface ApiOptions {
    method?: string;
    data?: string;
    form: string[];
    output?: string;
    auth: boolean;
}

type Fetch = typeof fetch;

const collect = (value: string, previous: string[]) => [...previous, value];

export function resolveApiUrl(path: string, baseUrl = BASE_URL): string {
    if (/^[a-z][a-z\d+.-]*:/i.test(path) || path.startsWith("//")) {
        throw new Error("API path must be relative, not an absolute URL");
    }

    const base = new URL(baseUrl);
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const url = new URL(normalizedPath, `${base.origin}/`);
    if (url.origin !== base.origin) {
        throw new Error(
            "API path must stay on the configured Pollinations host",
        );
    }
    return url.toString();
}

function readJsonInput(value: string, stdin: string): unknown {
    let raw = value;
    if (value === "-") raw = stdin;
    else if (value.startsWith("@")) {
        const path = value.slice(1);
        if (!existsSync(path)) throw new Error(`JSON file not found: ${path}`);
        raw = readFileSync(path, "utf-8");
    }
    if (!raw) throw new Error("JSON request body is empty");
    try {
        return JSON.parse(raw);
    } catch (error) {
        throw new Error(
            `Invalid JSON request body: ${error instanceof Error ? error.message : "parse failed"}`,
        );
    }
}

function buildForm(entries: string[]): FormData {
    const form = new FormData();
    for (const entry of entries) {
        const separator = entry.indexOf("=");
        if (separator <= 0) {
            throw new Error(
                `Invalid --form value: ${entry}. Expected field=value`,
            );
        }
        const field = entry.slice(0, separator);
        const value = entry.slice(separator + 1);
        if (!value.startsWith("@")) {
            form.append(field, value);
            continue;
        }

        const path = value.slice(1);
        if (!existsSync(path)) throw new Error(`Form file not found: ${path}`);
        const mime =
            MIME_BY_EXT[extname(path).toLowerCase()] ??
            "application/octet-stream";
        form.append(
            field,
            new Blob([readFileSync(path)], { type: mime }),
            basename(path),
        );
    }
    return form;
}

export async function requestApi(
    path: string,
    options: ApiOptions,
    stdin: string,
    apiKey = resolveApiKey(),
    fetchImpl: Fetch = fetch,
): Promise<Response> {
    if (options.data !== undefined && options.form.length > 0) {
        throw new Error("--data and --form cannot be used together");
    }
    if (stdin && options.form.length > 0) {
        throw new Error("Piped JSON and --form cannot be used together");
    }

    const hasJson = options.data !== undefined || stdin.length > 0;
    const hasBody = hasJson || options.form.length > 0;
    const method = (options.method ?? (hasBody ? "POST" : "GET")).toUpperCase();
    if (!METHODS.has(method)) {
        throw new Error(
            `Unsupported method: ${method}. Use GET, POST, PUT, PATCH, or DELETE`,
        );
    }
    if (method === "GET" && hasBody) {
        throw new Error(
            "GET requests cannot include --data, piped JSON, or --form",
        );
    }

    const headers = new Headers({ Accept: "*/*" });
    if (options.auth && apiKey) {
        headers.set("Authorization", `Bearer ${apiKey}`);
    }

    let body: BodyInit | undefined;
    if (options.form.length > 0) {
        body = buildForm(options.form);
    } else if (hasJson) {
        const source = options.data ?? "-";
        body = JSON.stringify(readJsonInput(source, stdin));
        headers.set("Content-Type", "application/json");
    }

    return fetchImpl(resolveApiUrl(path), { method, headers, body });
}

export async function printApiResponse(response: Response, output?: string) {
    const contentType = response.headers.get("content-type") ?? "";
    const buffer = Buffer.from(await response.arrayBuffer());

    if (!response.ok) {
        throw new ApiError(
            response.status,
            `${response.status} ${response.statusText}: ${buffer.toString("utf-8")}`,
        );
    }

    if (output) {
        writeFileSync(output, buffer);
        printMeta({
            path: output,
            status: response.status,
            contentType: contentType || null,
            size: buffer.length,
        });
        return;
    }

    if (buffer.length === 0) {
        printResult({ status: response.status });
        return;
    }

    const text = buffer.toString("utf-8");
    if (contentType.includes("json")) {
        process.stdout.write(`${JSON.stringify(JSON.parse(text), null, 2)}\n`);
        return;
    }

    if (
        contentType.startsWith("text/") ||
        contentType.includes("xml") ||
        contentType.includes("javascript")
    ) {
        if (getOutputMode() === "json") {
            process.stdout.write(
                `${JSON.stringify(
                    {
                        status: response.status,
                        contentType: contentType || null,
                        data: text,
                    },
                    null,
                    2,
                )}\n`,
            );
        } else {
            process.stdout.write(text.endsWith("\n") ? text : `${text}\n`);
        }
        return;
    }

    throw new Error(
        `Binary response (${contentType || "unknown content type"}); pass --output <path>`,
    );
}

export const apiCommand = new Command("api")
    .description("Call any Pollinations HTTP API path with stored bearer auth")
    .argument(
        "<path>",
        "Relative gen.pollinations.ai path, e.g. /v1/embeddings",
    )
    .option("-X, --method <method>", "GET, POST, PUT, PATCH, or DELETE")
    .option(
        "-d, --data <json|@file|->",
        "JSON body as a string, @file, or - for stdin",
    )
    .option(
        "-F, --form <field=value>",
        "Multipart field; use field=@file for uploads (repeatable)",
        collect,
        [],
    )
    .option("-o, --output <path>", "Write the response body to a file")
    .option("--no-auth", "Do not attach a stored or overridden API key")
    .addHelpText(
        "after",
        `\nExamples:\n  polli api /models --no-auth --json\n  polli api /v1/embeddings --data '{"model":"embedding","input":"hello"}' --json\n  cat request.json | polli api /v1/chat/completions --json\n  polli api /v1/audio/voice-isolator --form file=@speech.mp3 --output clean.mp3\n`,
    )
    .action(async (path: string, options: ApiOptions) => {
        try {
            const stdin = await readStdin();
            const response = await requestApi(path, options, stdin);
            await printApiResponse(response, options.output);
        } catch (error) {
            fail("API request failed", error);
        }
    });
