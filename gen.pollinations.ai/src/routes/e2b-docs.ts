import { describeRoute } from "hono-openapi";

// Lists the sandbox routes gen serves in the API reference. Fields, defaults
// and response bodies are E2B's: each entry links E2B's page for them instead
// of copying them, so only what Pollinations changes is written here.
const E2B_PAGES = "https://docs.e2b.dev/api-reference/sandboxes/";

const id = {
    name: "id",
    in: "path" as const,
    required: true,
    schema: { type: "string" as const, example: "example-sandbox" },
    description: "Sandbox ID, from create or list.",
};

type Entry = {
    e2bPage: string;
    e2bTitle: string;
    notes?: string;
    deprecated?: boolean;
    byId?: boolean;
    // Prepays runtime from the caller's credits.
    charges?: boolean;
    // Starts or resumes a sandbox, so the running limit applies.
    starts?: boolean;
    example?: unknown;
    created?: boolean;
};

function entry(
    summary: string,
    {
        e2bPage,
        e2bTitle,
        notes,
        deprecated,
        byId,
        charges,
        starts,
        example,
        created,
    }: Entry,
) {
    return describeRoute({
        tags: ["Sandboxes API"],
        summary,
        description: [
            notes,
            `Request and response fields: [E2B · ${e2bTitle}](${E2B_PAGES}${e2bPage})`,
        ]
            .filter(Boolean)
            .join("\n\n"),
        security: [{ bearerAuth: [] }],
        ...(deprecated && { deprecated }),
        ...(byId && { parameters: [id] }),
        ...(example !== undefined && {
            requestBody: {
                description: "Fields are on E2B's page, linked above.",
                content: {
                    "application/json": { schema: { example } },
                },
            },
        }),
        responses: {
            [created ? "201" : "2XX"]: {
                description: "Success. The body is described on E2B's page.",
            },
            401: { description: "Missing or invalid Pollinations API key." },
            ...(charges && {
                402: { description: "Not enough credits or key budget." },
            }),
            403: {
                description: "The key lacks the `account:machines` permission.",
            },
            ...(byId && {
                404: {
                    description: "No sandbox with this ID in your account.",
                },
            }),
            ...(starts && {
                429: {
                    description:
                        "Your account runs the most sandboxes allowed.",
                },
            }),
        },
    });
}

const CREATE =
    "Pollinations turns auto-pause on by default, enforces secured access and prepays the first lease from your credits. A timeout over 600 seconds keeps the sandbox running until then, prepaid 10 minutes at a time. Enabled `autoResume`, an `iam` configuration or non-empty `volumeMounts` return 400.";
const CONNECT =
    "Resumes a paused sandbox. Only `timeout` is used, 300 seconds if omitted. You prepay only the time beyond the current lease, and a timeout over 600 seconds keeps the sandbox running until then.";

export const sandboxDocs = {
    create: entry("Create sandbox", {
        e2bPage: "create-sandbox-v2",
        e2bTitle: "Create sandbox (v2)",
        notes: CREATE,
        charges: true,
        starts: true,
        created: true,
        example: { templateID: "pollinations", timeout: 600 },
    }),
    createV1: entry("Create sandbox (v1)", {
        e2bPage: "create-sandbox",
        e2bTitle: "Create sandbox",
        notes: `Kept for E2B's CLI; prefer v2. ${CREATE}`,
        deprecated: true,
        charges: true,
        starts: true,
        created: true,
        example: { templateID: "pollinations", timeout: 600 },
    }),
    list: entry("List sandboxes", {
        e2bPage: "list-sandboxes-v2",
        e2bTitle: "List sandboxes (v2)",
        notes: "Lists only your sandboxes, whatever metadata filter you pass. Only the v2 path is available.",
    }),
    get: entry("Get sandbox", {
        e2bPage: "get-sandbox",
        e2bTitle: "Get sandbox",
        byId: true,
    }),
    connect: entry("Connect or resume sandbox", {
        e2bPage: "connect-sandbox-v2",
        e2bTitle: "Connect sandbox (v2)",
        notes: CONNECT,
        byId: true,
        charges: true,
        starts: true,
        example: { timeout: 600 },
    }),
    connectV1: entry("Connect or resume sandbox (v1)", {
        e2bPage: "connect-to-sandbox",
        e2bTitle: "Connect to sandbox",
        notes: `Kept for E2B's CLI; prefer v2. ${CONNECT}`,
        deprecated: true,
        byId: true,
        charges: true,
        starts: true,
        example: { timeout: 600 },
    }),
    timeout: entry("Set sandbox timeout", {
        e2bPage: "set-sandbox-timeout",
        e2bTitle: "Set sandbox timeout",
        notes: "Extra runtime is prepaid from your credits; a shorter timeout refunds nothing. Over 600 seconds keeps the sandbox running until then; 600 or less ends that.",
        byId: true,
        charges: true,
        example: { timeout: 3600 },
    }),
    pause: entry("Pause sandbox", {
        e2bPage: "pause-sandbox",
        e2bTitle: "Pause sandbox",
        notes: "Stops the renewal a timeout over 600 seconds started. Unused prepaid time is not refunded.",
        byId: true,
    }),
    delete: entry("Delete sandbox", {
        e2bPage: "delete-sandbox",
        e2bTitle: "Delete sandbox",
        notes: "Unused prepaid time is not refunded. If the sandbox got a dedicated API key, revoke it separately.",
        byId: true,
    }),
    metrics: entry("Get sandbox metrics", {
        e2bPage: "get-sandbox-metrics",
        e2bTitle: "Get sandbox metrics",
        byId: true,
    }),
    logs: entry("Get sandbox logs", {
        e2bPage: "get-sandbox-logs",
        e2bTitle: "Get sandbox logs",
        notes: "Only this v1 path is available, not `/v2/sandboxes/{id}/logs`.",
        byId: true,
    }),
    network: entry("Update sandbox network", {
        e2bPage: "update-sandbox-network",
        e2bTitle: "Update sandbox network",
        byId: true,
        // Blocks all outbound traffic except the Pollinations API.
        example: { denyOut: ["0.0.0.0/0"], allowOut: ["gen.pollinations.ai"] },
    }),
    pricing: describeRoute({
        tags: ["Sandboxes API"],
        summary: "Get sandbox pricing",
        description:
            "Pollinations' rates in credits per vCPU-second and per GiB-second of memory, each template's size, and how many sandboxes an account can run at once. No key needed.",
        security: [],
        responses: {
            200: {
                description: "Rates, template sizes and the running limit.",
            },
        },
    }),
};
