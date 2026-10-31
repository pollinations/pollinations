import { azureSandbox } from "@shared/db/sandbox.ts";
import { sandboxTemplate } from "@shared/registry/sandbox.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "@/env.ts";

// Sandboxes on Azure Container Apps, answering the E2B API calls gen's
// routes/e2b.ts makes, so leases, keeps and billing stay one code path. Each
// box runs the E2B template's image with E2B's envd in it
// (operations/infrastructure/azure-sandboxes), so E2B's SDKs work in it too.

// Both providers name a sandbox's owner with this metadata key; on Azure it
// is also a label, which lists a user's boxes.
export const OWNER_KEY = "pollinations_user";
const API_VERSION = "2026-02-01-preview";
// The envd the image builds, which E2B's SDKs check before using features.
const ENVD_VERSION = "0.10.1";
const ENVD_PORT = 49983;
// `polli sandbox ssh` reaches sshd through a WebSocket on this port.
const SSH_PORT = 8022;
// The image's entrypoint, in place of E2B's orchestrator: it gives envd the
// /init body gen passes, then opens envd's port, so no one reaches envd
// before it has its token.
const BOOT = "/usr/local/bin/polli-box";
// A box this new may not have its row yet.
const CREATE_GRACE_MS = 60_000;
// E2B's create takes a timeout as 32-bit seconds, 15 when there is none.
const MAX_TIMEOUT_SECONDS = 2 ** 31 - 1;
const DEFAULT_TIMEOUT_SECONDS = 15;
// Gen's cron (wrangler.toml), every 5 minutes, stops a box whose lease has
// ended, so a lease runs on to the cron's next run, and callers pay up to it.
const CRON_MS = 5 * 60_000;

/** When a lease asked to end at `until` ends: at the cron run after it. */
export const azureLeaseEnd = (until: number) =>
    Math.ceil(until / CRON_MS) * CRON_MS;
// Azure names sandboxes by UUID; E2B's IDs are lowercase alphanumerics.
const AZURE_ID =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SANDBOX_PATH = /^(?:\/v2)?\/sandboxes\/([^/?]+)(?:\/(\w+))?$/;

type Box = {
    id: string;
    state: string;
    createdAt: string;
    labels?: Record<string, string>;
};
type Row = typeof azureSandbox.$inferSelect;

export const isAzureSandbox = (id: string) => AZURE_ID.test(id);

// Whether an E2B API path names an Azure sandbox.
export const isAzurePath = (path: string) =>
    isAzureSandbox(
        new URL(path, "https://e2b").pathname.match(SANDBOX_PATH)?.[1] ?? "",
    );

// Where a sandbox serves `port`: Azure puts the sandbox first in the host.
export const sandboxHost = (
    sandboxID: string,
    port: number,
    domain?: string | null,
) =>
    isAzureSandbox(sandboxID)
        ? `${sandboxID}--${port}.${domain}`
        : `${port}-${sandboxID}.${domain || "e2b.app"}`;

// Azure serves a group's ports on adcproxy.io in the group's region.
const domain = (env: CloudflareBindings) =>
    `${new URL(env.AZURE_SANDBOX_GROUP_URL ?? "").hostname.split(".")[1]}.adcproxy.io`;

let token: { value: string; expires: number } | undefined;

// Gen's Entra app may only manage the boxes in its sandbox group.
async function azureToken(env: CloudflareBindings) {
    if (token && token.expires > Date.now() + 60_000) return token.value;
    const response = await fetch(
        `https://login.microsoftonline.com/${env.AZURE_SANDBOX_TENANT_ID}/oauth2/v2.0/token`,
        {
            method: "POST",
            body: new URLSearchParams({
                grant_type: "client_credentials",
                client_id: env.AZURE_SANDBOX_CLIENT_ID ?? "",
                client_secret: env.AZURE_SANDBOX_CLIENT_SECRET ?? "",
                scope: "https://dynamicsessions.io/.default",
            }),
        },
    );
    if (!response.ok) {
        throw new Error(`Azure login returned ${response.status}`);
    }
    const { access_token, expires_in } = await response.json<{
        access_token: string;
        expires_in: number;
    }>();
    token = { value: access_token, expires: Date.now() + expires_in * 1000 };
    return token.value;
}

async function aca(
    env: CloudflareBindings,
    path: string,
    init: RequestInit = {},
) {
    const url = new URL(`${env.AZURE_SANDBOX_GROUP_URL}${path}`);
    url.searchParams.set("api-version", API_VERSION);
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${await azureToken(env)}`);
    headers.set("content-type", "application/json");
    const response = await fetch(url, { ...init, headers });
    if (!response.ok && response.status !== 404) {
        // A failed call of our own is never the caller's fault.
        const detail = (await response.text()).slice(0, 300);
        throw new HTTPException(502, {
            message: `Azure returned ${response.status}: ${detail}`,
        });
    }
    return response;
}

const e2bError = (status: number, message: string) =>
    Response.json({ code: status, message }, { status });

const notFound = (id: string) => e2bError(404, `Sandbox ${id} not found`);

async function box(env: CloudflareBindings, id: string) {
    const response = await aca(env, `/sandboxes/${id}`);
    return response.status === 404 ? null : response.json<Box>();
}

// Azure stops a box in the background; wait for it to settle.
async function waitFor(
    env: CloudflareBindings,
    id: string,
    done: (box: Box | null) => boolean,
) {
    for (let tries = 0; tries < 60; tries++) {
        const found = await box(env, id);
        if (done(found)) return found;
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new HTTPException(502, {
        message: `Sandbox ${id} did not settle on Azure`,
    });
}

// Answers once the boot script has given envd its token and opened its port.
async function waitForEnvd(env: CloudflareBindings, id: string) {
    const url = `https://${sandboxHost(id, ENVD_PORT, domain(env))}/health`;
    for (let tries = 0; tries < 60; tries++) {
        const response = await fetch(url).catch(() => null);
        if (response?.ok) return;
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new HTTPException(502, {
        message: `envd in sandbox ${id} did not start`,
    });
}

// E2B's sandbox detail, from the row and the box's state.
function detail(env: CloudflareBindings, row: Row, state: string) {
    const running = state === "Running";
    const template = sandboxTemplate(row.templateId);
    return {
        sandboxID: row.sandboxId,
        templateID: row.templateId,
        alias: row.templateId,
        clientID: "",
        startedAt: row.startedAt.toISOString(),
        endAt: row.endAt.toISOString(),
        cpuCount: template?.cpuCount,
        memoryMB: template?.memoryMB,
        diskSizeMB: template?.diskSizeMB,
        envdVersion: ENVD_VERSION,
        state: running ? ("running" as const) : ("paused" as const),
        metadata: row.metadata,
        domain: domain(env),
    };
}

// What E2B's create and connect return.
const connection = (env: CloudflareBindings, row: Row) => ({
    sandboxID: row.sandboxId,
    templateID: row.templateId,
    clientID: "",
    envdVersion: ENVD_VERSION,
    envdAccessToken: row.envdAccessToken,
    domain: domain(env),
});

type NewSandbox = {
    templateID: string;
    timeout?: number;
    metadata: Record<string, string>;
    envVars?: Record<string, string>;
    allow_internet_access?: boolean;
    network?: unknown;
};

async function create(env: CloudflareBindings, body: NewSandbox) {
    if (body.allow_internet_access === false || body.network) {
        return e2bError(
            400,
            "Network rules are not available for Azure sandboxes yet.",
        );
    }
    const seconds = body.timeout ?? DEFAULT_TIMEOUT_SECONDS;
    if (
        !Number.isInteger(seconds) ||
        seconds < 0 ||
        seconds > MAX_TIMEOUT_SECONDS
    ) {
        return e2bError(400, "timeout must be a whole number of seconds");
    }
    const size = sandboxTemplate(body.templateID);
    if (size?.provider !== "azure") {
        return e2bError(404, `Template ${body.templateID} not found`);
    }
    const accessToken = [...crypto.getRandomValues(new Uint8Array(32))]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
    const response = await aca(env, "/sandboxes", {
        method: "PUT",
        body: JSON.stringify({
            sourcesRef: { diskImage: { id: env.AZURE_SANDBOX_IMAGE } },
            resources: {
                cpu: `${size.cpuCount * 1000}m`,
                memory: `${size.memoryMB}Mi`,
            },
            labels: { [OWNER_KEY]: body.metadata[OWNER_KEY] },
            // envd takes its processes' variables from /init, not its own.
            environment: {
                POLLI_ENVD_INIT: JSON.stringify({
                    accessToken,
                    defaultUser: "user",
                    envVars: body.envVars,
                }),
            },
            // Gen's cron stops a box when its lease ends instead.
            lifecycle: { autoSuspendPolicy: { enabled: false } },
            ports: [ENVD_PORT, SSH_PORT].map((port) => ({
                port,
                auth: { anonymous: true },
            })),
            cmd: [BOOT],
        }),
    });
    const { id } = await response.json<Box>();
    const now = Date.now();
    const row: Row = {
        sandboxId: id,
        userId: body.metadata[OWNER_KEY],
        templateId: body.templateID,
        metadata: body.metadata,
        envdAccessToken: accessToken,
        startedAt: new Date(now),
        endAt: new Date(azureLeaseEnd(now + seconds * 1000)),
    };
    try {
        await drizzle(env.DB).insert(azureSandbox).values(row);
        await waitForEnvd(env, id);
    } catch (error) {
        // If the delete fails too, the cron stops the box when its lease ends.
        await kill(env, row).catch(() => {});
        throw error;
    }
    return Response.json(connection(env, row), { status: 201 });
}

// The caller's boxes, filtered like E2B's list. routes/e2b.ts always filters
// by owner.
async function list(env: CloudflareBindings, query: URLSearchParams) {
    const metadata = [...new URLSearchParams(query.get("metadata") ?? "")];
    const owner = metadata.find(([key]) => key === OWNER_KEY)?.[1] ?? "";
    const states = query.get("state")?.split(",");
    const [boxes, rows] = await Promise.all([
        aca(
            env,
            `/sandboxes?${new URLSearchParams({ labels: `${OWNER_KEY}=${owner}` })}`,
        ).then((response) => response.json<Box[]>()),
        drizzle(env.DB)
            .select()
            .from(azureSandbox)
            .where(eq(azureSandbox.userId, owner)),
    ]);
    const state = new Map(boxes.map((found) => [found.id, found.state]));
    return Response.json(
        rows
            .filter((row) => state.has(row.sandboxId))
            .map((row) => detail(env, row, state.get(row.sandboxId) ?? ""))
            .filter(
                (sandbox) =>
                    (!states || states.includes(sandbox.state)) &&
                    metadata.every(
                        ([key, value]) => sandbox.metadata[key] === value,
                    ),
            ),
    );
}

async function update(env: CloudflareBindings, id: string, set: Partial<Row>) {
    await drizzle(env.DB)
        .update(azureSandbox)
        .set(set)
        .where(eq(azureSandbox.sandboxId, id));
}

async function kill(env: CloudflareBindings, row: Row) {
    await aca(env, `/sandboxes/${row.sandboxId}`, { method: "DELETE" });
    await drizzle(env.DB)
        .delete(azureSandbox)
        .where(eq(azureSandbox.sandboxId, row.sandboxId));
    return new Response(null, { status: 204 });
}

// Like E2B's, a pause keeps the box's memory, and its endAt says when. The
// SDKs read a 409 as "already paused".
async function pause(env: CloudflareBindings, row: Row, found: Box) {
    if (found.state !== "Running") {
        return e2bError(409, `Sandbox ${row.sandboxId} is already paused`);
    }
    await aca(env, `/sandboxes/${row.sandboxId}/stop`, { method: "POST" });
    await update(env, row.sandboxId, { endAt: new Date() });
    return new Response(null, { status: 204 });
}

// Like E2B's, a timeout replaces a running sandbox's lease. routes/e2b.ts
// checks `seconds`.
async function timeout(
    env: CloudflareBindings,
    row: Row,
    found: Box,
    seconds: number,
) {
    if (found.state !== "Running") return notFound(row.sandboxId);
    await update(env, row.sandboxId, {
        endAt: new Date(azureLeaseEnd(Date.now() + seconds * 1000)),
    });
    return new Response(null, { status: 204 });
}

// Like E2B's, connect resumes a paused sandbox into a new run, and never
// shortens a running one's lease.
async function connect(
    env: CloudflareBindings,
    row: Row,
    found: Box,
    seconds: number,
) {
    const now = Date.now();
    const endAt = new Date(azureLeaseEnd(now + seconds * 1000));
    if (found.state === "Running") {
        if (endAt > row.endAt) await update(env, row.sandboxId, { endAt });
        return Response.json(connection(env, row));
    }
    // The new lease comes first, so the cron doesn't stop the box as it
    // resumes. A box still stopping must stop before it can resume.
    await update(env, row.sandboxId, { startedAt: new Date(now), endAt });
    try {
        await waitFor(env, row.sandboxId, (b) => b?.state !== "Stopping");
        await aca(env, `/sandboxes/${row.sandboxId}/resume`, {
            method: "POST",
        });
        await waitFor(env, row.sandboxId, (b) => b?.state === "Running");
        await waitForEnvd(env, row.sandboxId);
    } catch (error) {
        // An unpaid resume must not keep running; the cron stops it if this
        // stop fails.
        await update(env, row.sandboxId, { endAt: new Date() });
        await aca(env, `/sandboxes/${row.sandboxId}/stop`, {
            method: "POST",
        }).catch(() => {});
        throw error;
    }
    return Response.json(connection(env, row), { status: 201 });
}

export const azureConfigured = (env: CloudflareBindings) =>
    Boolean(env.AZURE_SANDBOX_CLIENT_SECRET);

/**
 * Answers an E2B API call for Azure's sandboxes: a create of an Azure
 * template, a list, or any call naming an Azure sandbox.
 */
export async function azureE2b(
    env: CloudflareBindings,
    path: string,
    init: RequestInit = {},
): Promise<Response> {
    const url = new URL(path, "https://e2b");
    const method = init.method ?? "GET";
    const listing = /^(\/v2)?\/sandboxes$/.test(url.pathname);
    if (!azureConfigured(env)) {
        return listing && method === "GET"
            ? Response.json([])
            : e2bError(503, "Azure sandboxes are not configured");
    }
    const body = init.body ? JSON.parse(String(init.body)) : {};
    if (listing) {
        return method === "POST"
            ? create(env, body)
            : list(env, url.searchParams);
    }
    const [, id = "", action = ""] = url.pathname.match(SANDBOX_PATH) ?? [];
    const [row, found] = await Promise.all([
        drizzle(env.DB)
            .select()
            .from(azureSandbox)
            .where(eq(azureSandbox.sandboxId, id))
            .get(),
        box(env, id),
    ]);
    if (!row || !found) return notFound(id);
    switch (`${method} ${action}`) {
        case "GET ":
            return Response.json({
                ...detail(env, row, found.state),
                envdAccessToken: row.envdAccessToken,
            });
        case "DELETE ":
            return kill(env, row);
        case "POST pause":
            return pause(env, row, found);
        case "POST timeout":
            return timeout(env, row, found, body.timeout);
        case "POST connect":
            return connect(env, row, found, body.timeout);
        case "GET metrics":
            return Response.json([]);
        case "GET logs":
            return Response.json({ logs: [], logEntries: [] });
        case "PUT network":
            return e2bError(
                400,
                "Network rules are not available for Azure sandboxes yet.",
            );
        default:
            return e2bError(404, `${method} ${url.pathname} is not available`);
    }
}

/**
 * Stops each running box of gen's whose lease has ended, as E2B's timeout
 * pauses a sandbox. A box without a row (a create that died half way) is
 * stopped too. Runs after the keeper has renewed the kept ones. Boxes without
 * an owner, such as build.mjs's builders, are left alone.
 */
export async function stopExpiredAzureSandboxes(env: CloudflareBindings) {
    if (!azureConfigured(env)) return;
    const [boxes, rows] = await Promise.all([
        aca(env, "/sandboxes").then((response) => response.json<Box[]>()),
        drizzle(env.DB)
            .select({
                sandboxId: azureSandbox.sandboxId,
                endAt: azureSandbox.endAt,
            })
            .from(azureSandbox),
    ]);
    const endAt = new Map(
        rows.map((row) => [row.sandboxId, row.endAt.getTime()]),
    );
    const now = Date.now();
    await Promise.all(
        boxes
            .filter(
                (found) =>
                    found.state === "Running" &&
                    found.labels?.[OWNER_KEY] &&
                    (endAt.get(found.id) ??
                        Date.parse(found.createdAt) + CREATE_GRACE_MS) <= now,
            )
            .map((found) =>
                aca(env, `/sandboxes/${found.id}/stop`, { method: "POST" }),
            ),
    );
}

// E2B's SDKs reach envd at E2B_SANDBOX_URL when it is set, naming the sandbox
// and port in headers. Azure's port URLs name the sandbox in the host, so
// with E2B_SANDBOX_URL=https://gen.pollinations.ai/alpha/e2b/sandbox the SDKs
// reach both providers' sandboxes through here. envd checks the caller's
// token itself.
export async function proxyEnvd(c: Context<Env>, prefix: string) {
    const id = c.req.header("e2b-sandbox-id") ?? "";
    if (c.req.header("e2b-sandbox-port") !== String(ENVD_PORT)) {
        return e2bError(400, `Only envd's port ${ENVD_PORT} is served here.`);
    }
    const url = new URL(c.req.url);
    const rest = url.pathname.slice(prefix.length) + url.search;
    const target =
        isAzureSandbox(id) && azureConfigured(c.env)
            ? `https://${sandboxHost(id, ENVD_PORT, domain(c.env))}`
            : /^[a-z0-9]+$/.test(id)
              ? "https://sandbox.e2b.app"
              : null;
    if (!target) return notFound(id);
    const response = await fetch(new Request(`${target}${rest}`, c.req.raw));
    const headers = new Headers(response.headers);
    // Never let a sandbox's answer run as a page of gen's.
    headers.set("content-security-policy", "sandbox");
    headers.set("x-content-type-options", "nosniff");
    return new Response(response.body, { status: response.status, headers });
}
