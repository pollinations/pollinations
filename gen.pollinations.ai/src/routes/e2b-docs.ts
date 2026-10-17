import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";

// Documentation only: the E2B proxy retains its existing request handling.
// Forwarded fields follow https://github.com/e2b-dev/E2B/blob/main/spec/openapi.yml.
const strings = z.record(z.string(), z.string());
const timeout = z
    .int()
    .min(1)
    .max(2147483647)
    .describe(
        "Seconds from now. Values above 600 renew prepaid runtime until this deadline, subject to credits and key validity. Unlike polli's CLI, the API does not use 0 for unlimited runtime.",
    );
const network = z.looseObject({
    allowOut: z
        .array(z.string())
        .optional()
        .describe(
            "Allowed IPs, CIDRs or domains; allow rules take precedence.",
        ),
    denyOut: z.array(z.string()).optional().describe("Denied IPs or CIDRs."),
});
const connection = z.looseObject({
    sandboxID: z.string(),
    templateID: z.string().optional(),
    envdVersion: z.string().optional(),
    domain: z.string().nullable().optional(),
    envdAccessToken: z
        .string()
        .optional()
        .describe("Sandbox access credential. Keep it private."),
    trafficAccessToken: z.string().nullable().optional(),
});
const detail = connection.extend({
    startedAt: z.iso.datetime(),
    endAt: z.iso
        .datetime()
        .describe(
            "Requested deadline for a sandbox with ongoing renewal; otherwise the current lease end.",
        ),
    state: z.enum(["running", "paused"]),
    cpuCount: z.number(),
    memoryMB: z.number(),
    diskSizeMB: z.number().optional(),
    metadata: strings.optional(),
});
const sandboxExample = {
    sandboxID: "example-sandbox",
    templateID: "pollinations",
    startedAt: "2026-10-17T12:00:00Z",
    endAt: "2026-10-17T12:10:00Z",
    state: "running",
    cpuCount: 2,
    memoryMB: 2048,
};
const error = z.object({ code: z.number(), message: z.string() });
const json = (schema: z.ZodType, example?: unknown) => ({
    "application/json": {
        schema: resolver(schema),
        ...(example === undefined ? {} : { example }),
    },
});
const body = (
    schema: z.ZodType,
    example: unknown,
    required = true,
): NonNullable<Description["requestBody"]> => ({
    required,
    content: {
        "application/json": {
            // @ts-expect-error hono-openapi's request-body types lag JSON Schema 2020-12.
            schema: { ...z.toJSONSchema(schema, { io: "input" }), example },
            example,
        },
    },
});
const response = (
    description: string,
    schema: z.ZodType,
    example?: unknown,
) => ({ description, content: json(schema, example) });
const errors = Object.fromEntries(
    Object.entries({
        400: "Invalid JSON, invalid parameters or an unsupported option.",
        401: "Missing or invalid Pollinations API key.",
        402: "Insufficient credits or key budget for prepaid runtime.",
        403: "Missing account:machines permission or access denied.",
        404: "Sandbox not found or owned by another user.",
        409: "Sandbox state conflicts with this operation.",
        429: "Request rate or concurrent sandbox limit reached.",
        500: "Sandbox service error.",
        502: "Upstream sandbox request failed.",
        503: "Sandbox service unavailable.",
        504: "Upstream sandbox request timed out.",
    }).map(([status, description]) => [status, response(description, error)]),
);
const id = {
    name: "id",
    in: "path" as const,
    required: true,
    schema: { type: "string" as const, example: "example-sandbox" },
    description: "Sandbox ID returned by creation or listing.",
};
type Description = Parameters<typeof describeRoute>[0];
function operation(summary: string, description: string, options: Description) {
    return describeRoute({
        tags: ["Sandboxes API"],
        summary,
        description: `${description}\n\nRequires a Pollinations secret key with \`account:machines\` permission. Only your own sandboxes are accessible.`,
        security: [{ bearerAuth: [] }],
        ...options,
        responses: { ...errors, ...options.responses },
    });
}

export const sandboxDocs = {
    create: operation(
        "Create sandbox",
        "Create a secure E2B sandbox and prepay its runtime in credits. Auto-pause defaults to true. Auto-resume, IAM and volume mounts are unsupported. The unversioned path is a compatibility alias; prefer /alpha/e2b/v2/sandboxes.",
        {
            requestBody: body(
                z.looseObject({
                    templateID: z.string(),
                    timeout: timeout.default(300),
                    autoPause: z.boolean().default(true),
                    metadata: strings.optional(),
                    envVars: strings.optional(),
                    allow_internet_access: z.boolean().optional(),
                    network: network
                        .extend({ allowPublicTraffic: z.boolean().optional() })
                        .optional(),
                }),
                { templateID: "pollinations", timeout: 600 },
            ),
            responses: {
                201: response(
                    "Sandbox created. Additional E2B connection fields may be returned.",
                    connection,
                    {
                        sandboxID: "example-sandbox",
                        templateID: "pollinations",
                        domain: "e2b.app",
                    },
                ),
            },
        },
    ),
    list: operation(
        "List sandboxes",
        "List your sandboxes. Results are always scoped to your account, including when filtering metadata.",
        {
            parameters: [
                {
                    name: "state",
                    in: "query",
                    style: "form",
                    explode: false,
                    schema: {
                        type: "string",
                        enum: ["running", "paused", "running,paused"],
                        example: "running,paused",
                    },
                    description: "Comma-separated states.",
                },
                {
                    name: "metadata",
                    in: "query",
                    schema: { type: "string" },
                    description:
                        "URL-encoded key=value pairs, such as app=demo.",
                },
                {
                    name: "limit",
                    in: "query",
                    schema: {
                        type: "integer",
                        minimum: 1,
                        maximum: 100,
                        default: 100,
                    },
                },
                {
                    name: "nextToken",
                    in: "query",
                    schema: { type: "string" },
                    description:
                        "Pagination token from the preceding X-Next-Token header.",
                },
            ],
            responses: {
                200: {
                    ...response("Your sandboxes.", z.array(detail), [
                        sandboxExample,
                    ]),
                    headers: {
                        "X-Next-Token": {
                            description:
                                "Token for the next page, when present.",
                            schema: { type: "string" },
                        },
                    },
                },
            },
        },
    ),
    get: operation(
        "Get sandbox",
        "Inspect a sandbox, including its state, resource size and timeout.",
        {
            parameters: [id],
            responses: {
                200: response("Sandbox details.", detail, sandboxExample),
            },
        },
    ),
    connect: operation(
        "Connect or resume sandbox",
        "Return connection details and resume a paused sandbox. Extending runtime charges credits in advance. Connecting never shortens a running lease. Prefer the /v2/sandboxes/{id}/connect path over its unversioned compatibility alias.",
        {
            parameters: [id],
            requestBody: body(
                z.object({ timeout: timeout.default(300) }),
                { timeout: 600 },
                false,
            ),
            responses: {
                200: response("Sandbox was already running.", connection, {
                    sandboxID: "example-sandbox",
                }),
                201: response("Paused sandbox resumed.", connection, {
                    sandboxID: "example-sandbox",
                }),
            },
        },
    ),
    pause: operation(
        "Pause sandbox",
        "Stop runtime and preserve files and memory. Ends ongoing renewal. Unused prepaid credits are not refunded.",
        {
            parameters: [id],
            responses: {
                204: { description: "Sandbox paused; no response body." },
            },
        },
    ),
    timeout: operation(
        "Set sandbox timeout",
        "Replace the timeout, measured from now. Additional runtime is prepaid; shortening it does not refund unused credits. Values above 600 enable ongoing renewal; shorter values end it. Use connect to resume a paused sandbox.",
        {
            parameters: [id],
            requestBody: body(z.object({ timeout }), { timeout: 3600 }),
            responses: {
                204: { description: "Timeout updated; no response body." },
            },
        },
    ),
    delete: operation(
        "Delete sandbox",
        "Permanently delete the sandbox and its files. Ends renewal with no refund of unused prepaid time. Its dedicated API key remains until separately revoked.",
        {
            parameters: [id],
            responses: {
                204: { description: "Sandbox deleted; no response body." },
            },
        },
    ),
    metrics: operation(
        "Get sandbox metrics",
        "Read CPU, memory and disk measurements.",
        {
            parameters: [
                id,
                ...["start", "end"].map((name) => ({
                    name,
                    in: "query" as const,
                    schema: { type: "integer" as const, minimum: 0 },
                    description: "Unix timestamp in seconds.",
                })),
            ],
            responses: {
                200: response(
                    "Resource measurements; memory and disk values are bytes.",
                    z.array(
                        z.looseObject({
                            timestamp: z.iso.datetime(),
                            timestampUnix: z.number(),
                            cpuCount: z.number(),
                            cpuUsedPct: z.number(),
                            memUsed: z.number(),
                            memTotal: z.number(),
                            memCache: z.number(),
                            diskUsed: z.number(),
                            diskTotal: z.number(),
                        }),
                    ),
                ),
            },
        },
    ),
    logs: operation(
        "Get sandbox logs",
        "Read system logs. This is the supported legacy E2B logs endpoint; /v2/sandboxes/{id}/logs is not exposed through Pollinations.",
        {
            parameters: [
                id,
                {
                    name: "start",
                    in: "query",
                    schema: { type: "integer", minimum: 0 },
                    description: "Unix timestamp in milliseconds.",
                },
                {
                    name: "limit",
                    in: "query",
                    schema: { type: "integer", minimum: 0, default: 1000 },
                },
            ],
            responses: {
                200: response(
                    "Sandbox logs.",
                    z.looseObject({
                        logs: z.array(
                            z.object({
                                timestamp: z.iso.datetime(),
                                line: z.string(),
                            }),
                        ),
                        logEntries: z.array(
                            z.object({
                                timestamp: z.iso.datetime(),
                                level: z.string(),
                                message: z.string(),
                                fields: strings,
                            }),
                        ),
                    }),
                ),
            },
        },
    ),
    network: operation(
        "Update sandbox network",
        "Replace outbound network rules for a running sandbox. Omitted rule fields are cleared. Additional E2B network configuration fields are forwarded.",
        {
            parameters: [id],
            requestBody: body(
                network.extend({
                    allow_internet_access: z.boolean().optional(),
                }),
                { denyOut: ["0.0.0.0/0"], allowOut: ["gen.pollinations.ai"] },
            ),
            responses: {
                204: {
                    description:
                        "Network configuration updated; no response body.",
                },
            },
        },
    ),
    pricing: describeRoute({
        tags: ["Sandboxes API"],
        summary: "Get sandbox pricing",
        security: [],
        description:
            "Public rates in credits per vCPU-second and GiB-second, template sizes, and the account concurrency limit. No key required.",
        responses: {
            200: response(
                "Current sandbox rates and sizes.",
                z.object({
                    maxRunning: z.int(),
                    vcpuSecond: z.number(),
                    gibSecond: z.number(),
                    templates: z.record(
                        z.string(),
                        z.object({
                            cpuCount: z.number(),
                            memoryMB: z.number(),
                        }),
                    ),
                }),
            ),
        },
    }),
};
