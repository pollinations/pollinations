import { env } from "cloudflare:test";
import crypto from "node:crypto";
import { getLogger } from "@logtape/logtape";
import { Hono } from "hono";
import { expect, inject } from "vitest";
import { createHonoMockHandler, type MockAPI } from "./fetch";

const log = getLogger(["test", "mock", "vcr"]);
const snapshotServerUrl = inject("snapshotServerUrl");

type RequestBodySnapshot = {
    type: "json" | "text" | "binary" | "formdata" | "empty";
    data: unknown;
};

type ResponseBodySnapshot = {
    type: "json" | "text" | "binary" | "stream" | "empty";
    data: unknown;
};

type StreamSnapshot = { data: string; delay: number }[];

type RequestSnapshot = {
    url: string;
    method: string;
    body: RequestBodySnapshot;
    params?: unknown;
};

type ResponseSnapshot = {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: ResponseBodySnapshot;
};

type Snapshot = {
    request: RequestSnapshot;
    response: ResponseSnapshot;
};

const hosts = [
    { name: "text", host: new URL(env.TEXT_SERVICE_URL).host },
    { name: "image", host: new URL(env.IMAGE_SERVICE_URL).host },
];

async function getSnapshotHash(request: Request): Promise<string> {
    const hash = crypto.createHash("md5");
    hash.update(request.headers.get("authorization") || "");
    hash.update(request.headers.get("content-type") || "");
    hash.update(`${request.method}:${request.url}`);
    try {
        const text = await request.clone().text();
        const body = JSON.parse(text || "{}");
        hash.update(`${body.model}` || "");
        hash.update(`${body.stream}` || "");
        hash.update(`${body.tool_choice}` || "");
        hash.update(`${JSON.stringify(body.messages)}`);
    } catch (error) {
        log.warn("Failed to parse request body: {error}", { error });
    }
    return hash.digest("hex");
}

async function getSnapshotFilename(
    hosts: { name: string; host: string }[],
    request: Request,
): Promise<string> {
    const url = new URL(request.url);
    const hash = await getSnapshotHash(request);

    const matchingHost = hosts.find(({ host }) => host === url.host)?.name;

    const host =
        matchingHost ||
        url.host
            .toLowerCase()
            .replace(/^www\./, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");

    return `${host}-${hash}.json`;
}

async function getSnapshot(filename: string): Promise<Snapshot> {
    log.trace(`Reading snapshot: ${filename}`);
    const response = await fetch(`${snapshotServerUrl}/${filename}`);
    if (!response.ok) {
        const { error } = (await response.json()) as { error: string };
        throw new Error(`Error reading snapshot: ${error}`);
    }
    return await response.json();
}

async function writeSnapshot(
    filename: string,
    snapshot: Snapshot,
): Promise<void> {
    log.trace(`Writing snapshot: ${filename}`);
    const response = await fetch(`${snapshotServerUrl}/${filename}`, {
        method: "PUT",
        body: JSON.stringify(snapshot),
    });
    if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        log.warning("Error writing snapshot: {error}", { error: data.error });
    }
}

export function createMockVcr(originalFetch: typeof fetch): MockAPI<{}> {
    const vcr = new Hono()
        .all("*", async (c) => {
            const snapshotFilename = await getSnapshotFilename(
                hosts,
                c.req.raw,
            );

            if (env.TEST_VCR_MODE !== "record-only") {
                // Replay snapshot if it exists
                try {
                    const snapshot = await getSnapshot(snapshotFilename);
                    return replaySnapshotResponse(snapshot);
                } catch (_error: any) {
                    log.warn(`Missing snapshot: ${snapshotFilename}`);
                }
            }

            if (env.TEST_VCR_MODE !== "replay-only") {
                // Record actual upstream response
                log.trace(`Recording: ${c.req.method} ${c.req.url}`);
                // Clone request before fetch since it will consume the body
                const requestClone = c.req.raw.clone() as Request;
                const response = await originalFetch(c.req.raw);
                const responseClone = response.clone();
                const snapshot = await recordSnapshot(
                    requestClone,
                    responseClone,
                );
                await writeSnapshot(snapshotFilename, snapshot);
                return response;
            }

            expect.fail(
                [
                    "Encountered missing snapshot in replay-only mode.",
                    "Run without TEST_VCR_MODE=replay-only to capture.",
                ].join("\n"),
            );
        })
        .onError((error) => {
            throw error;
        });

    return {
        state: {},
        handlerMap: Object.fromEntries(
            hosts.map(({ host }) => [host, createHonoMockHandler(vcr)]),
        ),
        reset: () => {},
    };
}

async function recordRequestBody(
    request: Request,
): Promise<RequestBodySnapshot> {
    if (!request.body || ["GET", "HEAD"].includes(request.method)) {
        return { type: "empty", data: null };
    }
    const contentType = request.headers.get("content-type") || "";
    // json
    if (contentType.includes("application/json")) {
        const text = await request.text();
        try {
            return {
                type: "json",
                data: JSON.parse(text),
            };
        } catch {
            return {
                type: "text",
                data: text,
            };
        }
    }
    // form data
    if (
        contentType.includes("multipart/form-data") ||
        contentType.includes("application/x-www-form-urlencoded")
    ) {
        const formData = await request.formData();
        return {
            type: "formdata",
            data: Object.fromEntries(formData.entries()),
        };
    }
    // text
    if (contentType.startsWith("text/")) {
        return {
            type: "text",
            data: await request.text(),
        };
    }
    const buffer = await request.arrayBuffer();
    return {
        type: "binary",
        data: Buffer.from(buffer).toString("base64"),
    };
}

async function recordResponseBody(
    response: Response,
): Promise<ResponseBodySnapshot> {
    const contentType = response.headers.get("content-type");
    const transferEncoding = response.headers.get("transfer-encoding");
    // empty
    if (!response.body) {
        return { type: "empty", data: null };
    }
    // stream
    if (
        transferEncoding === "chunked" ||
        contentType?.includes("text/event-stream") ||
        contentType?.includes("application/octet-stream")
    ) {
        const chunks = await recordChunks(response.clone());
        return {
            type: "stream",
            data: chunks,
        };
    }
    // json
    if (contentType?.includes("application/json")) {
        try {
            return {
                type: "json",
                data: await response.json(),
            };
        } catch {
            return {
                type: "text",
                data: await response.clone().text(),
            };
        }
    }
    // text
    if (
        contentType?.startsWith("text/") ||
        contentType?.includes("application/xml") ||
        contentType?.includes("application/javascript")
    ) {
        return {
            type: "text",
            data: await response.text(),
        };
    }
    // binary
    const buffer = await response.arrayBuffer();
    return {
        type: "binary",
        data: Buffer.from(buffer).toString("base64"),
    };
}

async function recordChunks(
    response: Response,
): Promise<{ data: string; delay: number }[]> {
    const chunks: { data: string; delay: number }[] = [];
    const reader = response.body?.getReader();

    if (!reader) {
        return chunks;
    }

    const decoder = new TextDecoder();
    let lastTimestamp = Date.now();

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const now = Date.now();
            const delay = now - lastTimestamp;
            lastTimestamp = now;

            chunks.push({
                // data: Buffer.from(value).toString("base64"),
                data: decoder.decode(value, { stream: true }),
                delay,
            });
        }
    } finally {
        reader.releaseLock();
    }

    return chunks;
}

async function recordRequest(request: Request): Promise<RequestSnapshot> {
    return {
        url: request.url,
        method: request.method,
        body: await recordRequestBody(request),
        params: { ...new URL(request.url).searchParams },
    };
}

async function recordResponse(response: Response): Promise<ResponseSnapshot> {
    return {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        body: await recordResponseBody(response),
    };
}

async function recordSnapshot(
    request: Request,
    response: Response,
): Promise<Snapshot> {
    return {
        request: await recordRequest(request),
        response: await recordResponse(response),
    };
}

function replayChunks(
    snapshot: StreamSnapshot,
    maxDelayMs: number = 10,
): ReadableStream {
    const encoder = new TextEncoder();
    async function* streamGenerator(): AsyncGenerator<Uint8Array<ArrayBuffer>> {
        for (const chunk of snapshot) {
            await new Promise((resolve) =>
                setTimeout(resolve, Math.min(maxDelayMs, chunk.delay)),
            );
            yield encoder.encode(chunk.data);
        }
    }
    // @ts-expect-error - ReadableStream.from is supported
    return ReadableStream.from(streamGenerator());
}

function replayResponseBody(
    snapshot: Awaited<ReturnType<typeof recordResponseBody>>,
): BodyInit | null {
    switch (snapshot.type) {
        case "empty":
            return null;

        case "json":
            return JSON.stringify(snapshot.data);

        case "text":
            return snapshot.data as string;

        case "binary":
            return Buffer.from(snapshot.data as string, "base64");

        case "stream":
            return replayChunks(snapshot.data as StreamSnapshot);
    }
}

function replaySnapshotResponse(snapshot: Snapshot): Response {
    const body = replayResponseBody(snapshot.response.body);
    return new Response(body, {
        status: snapshot.response.status,
        statusText: snapshot.response.statusText,
        headers: snapshot.response.headers,
    });
}
