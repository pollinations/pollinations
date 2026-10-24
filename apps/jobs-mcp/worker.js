import { setTimeout as sleep } from "node:timers/promises";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { requireApiKey } from "../../packages/mcp/src/utils/authUtils.js";
import {
    buildUrl,
    createMCPResponse,
    createTextContent,
    fetchWithAuth,
    parseApiError,
} from "../../packages/mcp/src/utils/coreUtils.js";

const GENERATION_RESOURCES = ["image", "video", "audio", "3d"];
const JOB_ID_PATTERN = /^[0-9a-f]{64}$/;
const MAX_WAIT_SECONDS = 300;
const MAX_RESULT_BYTES = 20_000_000;
const DEFAULT_RESULT_BYTES = 5_000_000;
const FALLBACK_POLL_SECONDS = 5;
const NOT_FOUND_NOTE =
    "The job id is unknown: job status records expire 24 hours after completion, " +
    "and another account's job always reads as not found.";

class ToolError extends Error {}

function requireJobId(value) {
    if (typeof value !== "string" || !JOB_ID_PATTERN.test(value)) {
        throw new ToolError(
            "job_id must be 64 lowercase hex characters, exactly as returned by submit_media_job",
        );
    }
    return value;
}

function requireInteger(value, name, fallback, min, max) {
    if (value === undefined) return fallback;
    if (
        typeof value !== "number" ||
        !Number.isInteger(value) ||
        value < min ||
        value > max
    ) {
        throw new ToolError(
            `${name} must be an integer number of seconds between ${min} and ${max}`,
        );
    }
    return value;
}

/**
 * Read a Pollinations job payload (`GET /v1/jobs/:id` and the JSON body its
 * result endpoint returns with 409) into one state model every tool reports
 * the same way.
 */
function describeJob(payload, seen) {
    const status =
        typeof payload?.status === "string" ? payload.status : "unknown";
    const state = ["pending", "succeeded", "failed"].includes(status)
        ? status
        : "unknown";
    let note;
    if (state === "pending") {
        note =
            "Still generating; retry after retry_after_seconds. Polling a job never charges again.";
    } else if (state === "succeeded") {
        note = "Download the finished file with download_media_job_result.";
    } else if (state === "failed") {
        note = "The generation failed; submit_media_job again to retry.";
    } else {
        note = `Pollinations returned an unexpected job status (${JSON.stringify(
            status,
        )}); the raw payload is included unchanged.`;
    }
    return {
        state,
        status: payload?.status ?? null,
        polls: seen,
        id: payload?.id ?? null,
        state_url: payload?.status_url ?? payload?.result_url ?? null,
        created_at: payload?.created_at ?? null,
        completed_at: payload?.completed_at ?? null,
        expires_at: payload?.expires_at ?? null,
        error: payload?.error ?? null,
        note,
    };
}

function enclosureUrl(response) {
    return (
        response.headers
            .get("Link")
            ?.match(/<([^>]+)>\s*;\s*rel="?enclosure"?/i)?.[1] ?? null
    );
}

function declaredLength(response) {
    const contentLength = Number(response.headers.get("content-length"));
    return Number.isFinite(contentLength) && contentLength > 0
        ? contentLength
        : null;
}

async function collect(result, maxBytes) {
    const declared = declaredLength(result);
    if (declared !== null && declared > maxBytes) {
        await result.body?.cancel();
        return null;
    }
    const chunks = [];
    let total = 0;
    if (result.body) {
        const reader = result.body.getReader();
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.byteLength;
            if (total > maxBytes) {
                await reader.cancel();
                return null;
            }
            chunks.push(Buffer.from(value));
        }
    }
    if (total === 0) return Buffer.alloc(0);
    return Buffer.concat(chunks, total);
}

async function fetchJob(jobId, context) {
    const response = await fetchWithAuth(
        buildUrl(`/v1/jobs/${jobId}`),
        {},
        context,
    );
    if (response.status === 404) {
        await response.body?.cancel();
        return {
            found: false,
            id: jobId,
            state: "not_found",
            note: NOT_FOUND_NOTE,
        };
    }
    if (!response.ok) {
        const error = await response.text();
        throw new ToolError(parseApiError(response.status, error));
    }
    const payload = await response.json();
    return {
        found: true,
        retry_after_seconds: retryAfterSeconds(response.headers),
        ...describeJob(payload, 1),
    };
}

function submitUrl(args) {
    const query = { ...flattenParams(args.params) };
    if (args.model !== undefined && args.model !== "") query.model = args.model;
    return buildUrl(
        `/${args.resource}/${encodeURIComponent(args.prompt)}`,
        query,
    );
}

function flattenParams(params) {
    if (params === undefined || params === null) return {};
    const query = {};
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null) continue;
        if (
            ["string", "number", "boolean"].includes(typeof value) &&
            !Array.isArray(value)
        ) {
            query[key] = value;
        } else {
            throw new ToolError(
                `params.${key} must be a string, number, or boolean (Pollinations generates from one query string; template-style parameters are not supported)`,
            );
        }
    }
    return query;
}

/**
 * Submit one generation as an async job, check it once, wait for it inside a
 * bounded budget, or take its finished file. Every path uses the caller's own
 * Pollinations key, so generation bills their Pollen at the model's rate and
 * job polling stays free.
 */
function buildServer() {
    const server = new McpServer(
        { name: "jobs-mcp", title: "Jobs MCP", version: "0.1.0" },
        { capabilities: { tools: {} } },
    );

    server.registerTool(
        "submit_media_job",
        {
            description:
                "Queue an image, video, audio, or 3D generation as an asynchronous Pollinations job and return at once with a job_id (HTTP 202). " +
                "Use this for anything that may take longer than one tool call; then poll with get_media_job or wait_media_job and download with download_media_job_result. " +
                "Identical requests join the same durable generation and one charge, so sit tight on one job_id instead of resubmitting. " +
                "Params are Pollinations generation query parameters (model, width, height, duration, seed, safe, nologo, ...); an already-cached result returns with already_complete instead of a job_id.",
            inputSchema: z.object({
                resource: z
                    .string()
                    .describe("Generation family: image, video, audio, or 3d"),
                prompt: z.string().describe("Text prompt to generate from"),
                model: z
                    .string()
                    .optional()
                    .describe(
                        "Pollinations model id, e.g. google/veo-3.1-fast",
                    ),
                params: z
                    .record(
                        z.string(),
                        z.union([z.string(), z.number(), z.boolean()]),
                    )
                    .optional()
                    .describe("Extra generation query parameters"),
            }),
        },
        async (args, context) => {
            requireApiKey(context);
            if (!GENERATION_RESOURCES.includes(args.resource)) {
                throw new ToolError(
                    `resource must be one of ${GENERATION_RESOURCES.join(
                        ", ",
                    )} (async jobs only exist for media generation)`,
                );
            }
            if (typeof args.prompt !== "string" || args.prompt === "") {
                throw new ToolError("prompt must be a non-empty string");
            }
            const response = await fetchWithAuth(
                submitUrl(args),
                { headers: { Prefer: "respond-async" } },
                context,
            );

            if (response.status === 202) {
                const job = await response.json();
                const retryAfter = response.headers.get("Retry-After");
                return createMCPResponse([
                    createTextContent(
                        {
                            accepted: true,
                            id: job.id,
                            status: job.status,
                            status_url: job.status_url,
                            location: response.headers.get("Location"),
                            retry_after_seconds:
                                retryAfter === null
                                    ? null
                                    : Number(retryAfter) || retryAfter,
                            resource: args.resource,
                            note: "A job id was created. Check it with get_media_job, wait for it with wait_media_job, and download it with download_media_job_result. Identical requests share one generation and one charge; polling never charges again.",
                        },
                        true,
                    ),
                ]);
            }

            if (response.status === 200) {
                const mediaUrl = enclosureUrl(response);
                const contentType =
                    response.headers.get("content-type") ||
                    "application/octet-stream";
                const length = declaredLength(response);
                await response.body?.cancel();
                return createMCPResponse([
                    createTextContent(
                        {
                            accepted: false,
                            already_complete: true,
                            content_type: contentType,
                            size_bytes: length,
                            media_url: mediaUrl,
                            note: mediaUrl
                                ? "The identical request was already generated and cached, so no job exists and no new charge happened. The finished file is at media_url."
                                : "The identical request was already generated and cached, so no job exists and no new charge happened. Request generation without Prefer: respond-async to receive the file inline.",
                        },
                        true,
                    ),
                ]);
            }

            const error = await response.text();
            throw new ToolError(parseApiError(response.status, error));
        },
    );

    server.registerTool(
        "get_media_job",
        {
            description:
                "Read one async job's current status: a single free Pollinations call returning state (pending, succeeded, failed), timestamps, the result URL once succeeded, and retry_after_seconds while pending. " +
                "Unknown, expired, or other-account job ids read as state not_found (status records expire 24 hours after completion).",
            inputSchema: z.object({
                job_id: z
                    .string()
                    .describe(
                        "64 lowercase hex characters from submit_media_job",
                    ),
            }),
        },
        async (args, context) => {
            requireApiKey(context);
            const jobId = requireJobId(args.job_id);
            return createMCPResponse([
                createTextContent(await fetchJob(jobId, context), true),
            ]);
        },
    );

    server.registerTool(
        "wait_media_job",
        {
            description:
                "Poll one async job inside one bounded budget instead of looping by hand: repeatedly reads its free status endpoint until it leaves pending (succeeded or failed) or the budget runs out, using the server's Retry-After between polls. " +
                "max_wait_seconds 0 means one single check. A timeout is not a failure: call wait_media_job again with the same job_id; the job itself keeps running.",
            inputSchema: z.object({
                job_id: z
                    .string()
                    .describe(
                        "64 lowercase hex characters from submit_media_job",
                    ),
                max_wait_seconds: z
                    .number()
                    .optional()
                    .describe(
                        "Total seconds to keep polling (0-300, default 45)",
                    ),
                poll_interval_seconds: z
                    .number()
                    .optional()
                    .describe(
                        "Fallback seconds between polls (1-60, default 5); the server's Retry-After wins",
                    ),
            }),
        },
        async (args, context) => {
            requireApiKey(context);
            const jobId = requireJobId(args.job_id);
            const maxWait = requireInteger(
                args.max_wait_seconds,
                "max_wait_seconds",
                45,
                0,
                MAX_WAIT_SECONDS,
            );
            const pollInterval = requireInteger(
                args.poll_interval_seconds,
                "poll_interval_seconds",
                FALLBACK_POLL_SECONDS,
                1,
                60,
            );
            const startedAt = Date.now();
            const deadline = startedAt + maxWait * 1000;
            let seen = 1;
            let job;
            let timedOut = false;
            for (;;) {
                job = await fetchJob(jobId, context);
                if (job.state !== "pending") break;
                const remainingMs = deadline - Date.now();
                if (remainingMs <= 0) {
                    timedOut = true;
                    break;
                }
                const suggested =
                    typeof job.retry_after_seconds === "number"
                        ? job.retry_after_seconds
                        : null;
                const waitMs = Math.min(
                    Math.max(suggested ?? pollInterval, 1) * 1000,
                    remainingMs,
                );
                await sleep(waitMs);
                seen += 1;
            }
            const waitedSeconds = Math.max(
                0,
                Math.round((Date.now() - startedAt) / 1000),
            );
            return createMCPResponse([
                createTextContent(
                    {
                        timed_out: timedOut,
                        waited_seconds: waitedSeconds,
                        ...job,
                        polls: seen,
                        ...(timedOut && {
                            note: `Still generating after ${waitedSeconds} seconds of polling; the job keeps running. Call wait_media_job again with this job_id (or use get_media_job for one free check), and submit it again only within its dedupe window to join the same generation.`,
                        }),
                    },
                    true,
                ),
            ]);
        },
    );

    server.registerTool(
        "download_media_job_result",
        {
            description:
                "Download a succeeded async job's file through the caller's own Pollinations key: small images come back as an image (and small text files as text), everything else comes back as media metadata with content_type, size, and a media_url when Pollinations publishes the file. " +
                "A pending or failed job answers with state instead (never a file), an unknown job id with state not_found.",
            inputSchema: z.object({
                job_id: z
                    .string()
                    .describe(
                        "64 lowercase hex characters from submit_media_job",
                    ),
                max_bytes: z
                    .number()
                    .optional()
                    .describe(
                        "Inline size budget in bytes (1-20000000, default 5000000)",
                    ),
            }),
        },
        async (args, context) => {
            requireApiKey(context);
            const jobId = requireJobId(args.job_id);
            const maxBytes = requireInteger(
                args.max_bytes,
                "max_bytes",
                DEFAULT_RESULT_BYTES,
                1,
                MAX_RESULT_BYTES,
            );
            const response = await fetchWithAuth(
                buildUrl(`/v1/jobs/${jobId}/result`),
                {},
                context,
            );

            if (response.status === 409) {
                const payload = await response.json();
                return createMCPResponse([
                    createTextContent(
                        {
                            delivered: false,
                            retry_after_seconds: retryAfterSeconds(
                                response.headers,
                            ),
                            ...describeJob(payload, 1),
                        },
                        true,
                    ),
                ]);
            }
            if (response.status === 404) {
                await response.body?.cancel();
                return createMCPResponse([
                    createTextContent(
                        {
                            delivered: false,
                            id: jobId,
                            state: "not_found",
                            note: NOT_FOUND_NOTE,
                        },
                        true,
                    ),
                ]);
            }
            if (!response.ok) {
                const error = await response.text();
                throw new ToolError(parseApiError(response.status, error));
            }

            const contentType =
                (response.headers.get("content-type") || "").split(";")[0] ||
                "application/octet-stream";
            const mediaUrl = enclosureUrl(response);
            const size = declaredLength(response);
            const body = await collect(response, maxBytes);

            if (body === null) {
                return createMCPResponse([
                    createTextContent(
                        {
                            delivered: false,
                            state: "succeeded",
                            id: jobId,
                            content_type: contentType,
                            size_bytes: size,
                            media_url: mediaUrl,
                            note: mediaUrl
                                ? "The file is larger than max_bytes, so take the unlisted copy at media_url instead of downloading it through this tool."
                                : `The file is larger than max_bytes (${size ?? "unknown"} bytes). Call download_media_job_result again with a higher max_bytes (up to ${MAX_RESULT_BYTES}), or download it with: ${resultCurl(jobId)}`,
                        },
                        true,
                    ),
                ]);
            }

            const blocks = [
                createTextContent(
                    {
                        delivered: true,
                        state: "succeeded",
                        id: jobId,
                        content_type: contentType,
                        size_bytes: body.length,
                        media_url: mediaUrl,
                        note: "Finished job file delivered in this tool result.",
                    },
                    true,
                ),
            ];
            if (contentType.startsWith("image/")) {
                blocks.push({
                    type: "image",
                    data: body.toString("base64"),
                    mimeType: contentType,
                });
            } else if (
                ["text/", "application/json", "application/gltf-binary"].some(
                    (prefix) => contentType.startsWith(prefix),
                )
            ) {
                blocks.push({
                    type: "text",
                    text: body.toString("utf8"),
                });
            } else if (mediaUrl) {
                blocks.push({
                    type: "resource_link",
                    uri: mediaUrl,
                    name: `job-${jobId.slice(0, 8)}-result`,
                    mimeType: contentType,
                });
            } else if (body.length <= 4_000_000) {
                blocks[0].note_b64 = body.toString("base64");
            }
            return createMCPResponse(blocks);
        },
    );

    return server;
}

function resultCurl(jobId) {
    return `curl -H "Authorization: Bearer YOUR_POLLINATIONS_KEY" -o job-result "${buildUrl(
        `/v1/jobs/${jobId}/result`,
    )}"`;
}

/** Retry-After in seconds, defaulting to the 5 seconds Pollinations sends. */
function retryAfterSeconds(headers) {
    const header = headers.get("Retry-After");
    if (header === null) return FALLBACK_POLL_SECONDS;
    const seconds = Number(header);
    return Number.isFinite(seconds) && seconds >= 0
        ? seconds
        : FALLBACK_POLL_SECONDS;
}

const mcpHandler = createMcpHandler(() => buildServer(), {
    legacy: "stateless",
    onerror: (error) => console.error(error),
});

function readBearerToken(request) {
    const authorization = request.headers.get("authorization");
    if (!authorization) return null;

    const [scheme, token] = authorization.trim().split(/\s+/, 2);
    if (scheme?.toLowerCase() !== "bearer" || !token) {
        return null;
    }
    return token;
}

function unauthorizedResponse() {
    return Response.json(
        {
            error: "unauthorized",
            message: "Send a Pollinations API key as a bearer token.",
        },
        {
            status: 401,
            headers: {
                "WWW-Authenticate": 'Bearer realm="jobs-mcp.pollinations.ai"',
            },
        },
    );
}

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "jobs-mcp",
                transport: "streamable-http",
                endpoint: "/",
                stateless: true,
            });
        }

        if (url.pathname !== "/") {
            return new Response("Not found", { status: 404 });
        }

        const token = readBearerToken(request);
        if (!token) return unauthorizedResponse();

        if (
            request.method === "POST" &&
            Array.isArray(
                await request
                    .clone()
                    .json()
                    .catch(() => null),
            )
        ) {
            return Response.json(
                {
                    error: "invalid_request",
                    message: "Batch requests are not supported.",
                },
                { status: 400 },
            );
        }

        return mcpHandler.fetch(request, {
            authInfo: {
                token,
                clientId: "pollinations-api-key",
                scopes: [],
            },
        });
    },
};
