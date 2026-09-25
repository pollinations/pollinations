import { validator } from "@shared/middleware/validator.ts";
import { type Context, Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { describeRoute } from "hono-openapi";
import { z } from "zod";
import type { Env } from "@/env.ts";
import { auth } from "@/middleware/auth.ts";
import { edgeRateLimit } from "@/middleware/rate-limit-edge.ts";

const SMOL_API = "https://api.smolmachines.com";
const TAG = "🖥️ Machines";
const MAX_MACHINES_PER_USER = 3;

type SmolMachine = {
    id: string;
    name: string;
    state: string;
    ready?: boolean;
    error?: string | null;
    source: { reference: string };
    resources: { cpus: number; memoryMb: number; diskGb: number };
    autoStopSeconds: number | null;
    createdAt: string;
};

const NameSchema = z
    .string()
    .regex(/^[a-z0-9]([a-z0-9-]{0,22}[a-z0-9])?$/)
    .meta({ description: "Lowercase letters, digits and dashes, 1-24 long." });

const CreateMachineSchema = z.object({
    name: NameSchema,
    image: z.string().min(1).max(200).meta({
        description:
            "OCI image reference, for example `node:22-bookworm-slim`.",
    }),
    command: z.array(z.string()).min(1).optional().meta({
        description:
            "Process the machine runs on every start. It replaces the image entrypoint and is the only thing that survives a stop and start.",
    }),
    env: z.record(z.string(), z.string()).optional(),
    cpus: z.number().int().min(1).max(4).default(1),
    memoryMb: z.number().int().min(256).max(8192).default(1024),
    diskGb: z.number().int().min(1).max(20).default(5),
    autoStopSeconds: z.number().int().min(60).optional().meta({
        description: "Stop after this long without activity. Omit to stay on.",
    }),
});

const ExecSchema = z.object({
    command: z.array(z.string()).min(1),
    cwd: z.string().optional(),
    env: z.record(z.string(), z.string()).optional(),
    stdin: z.string().optional(),
    timeoutSeconds: z.number().int().min(1).max(600).optional(),
    background: z.boolean().optional().meta({
        description: "Detach the process and return its pid.",
    }),
});

type MachinesContext = Context<Env>;

// smol cloud has one tenant for all of Pollinations, so ownership is the
// name prefix: a hash of the caller's user id. Guest ports are not exposed:
// smol's ingress forwards our tenant key to the guest as `authorization`.
async function ownerPrefix(userId: string): Promise<string> {
    const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(userId),
    );
    const hex = [...new Uint8Array(digest).slice(0, 10)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
    return `p-${hex}-`;
}

function smol(c: MachinesContext, path: string, init?: RequestInit) {
    const headers = new Headers(init?.headers);
    headers.set("authorization", `Bearer ${c.env.SMOL_API_KEY}`);
    return fetch(`${SMOL_API}${path}`, { ...init, headers });
}

async function smolJson<T>(
    c: MachinesContext,
    path: string,
    method = "GET",
    body?: unknown,
): Promise<T> {
    const response = await smol(c, path, {
        method,
        ...(body !== undefined && {
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        }),
    });
    if (!response.ok) {
        const message = await response.text();
        c.var.log.warn("smol {method} {path} failed: {status} {message}", {
            method,
            path,
            status: response.status,
            message,
        });
        throw new HTTPException(
            (response.status < 500
                ? response.status
                : 502) as ContentfulStatusCode,
            { message: message.slice(0, 500) || "Machine backend error" },
        );
    }
    return (response.status === 204 ? null : await response.json()) as T;
}

async function listOwned(c: MachinesContext): Promise<SmolMachine[]> {
    const prefix = await ownerPrefix(c.var.auth.requireUser().id);
    const body = await smolJson<SmolMachine[] | { machines: SmolMachine[] }>(
        c,
        "/v1/machines",
    );
    const machines = Array.isArray(body) ? body : body.machines;
    return machines.filter((machine) => machine.name.startsWith(prefix));
}

async function findOwned(c: MachinesContext): Promise<SmolMachine> {
    const prefix = await ownerPrefix(c.var.auth.requireUser().id);
    const name = `${prefix}${c.req.param("name")}`;
    const machine = (await listOwned(c)).find((m) => m.name === name);
    if (!machine) {
        throw new HTTPException(404, { message: "Machine not found" });
    }
    return machine;
}

function publicMachine(machine: SmolMachine, prefix: string) {
    return {
        name: machine.name.slice(prefix.length),
        state: machine.state,
        ready: machine.ready ?? false,
        error: machine.error ?? null,
        image: machine.source.reference,
        cpus: machine.resources.cpus,
        memoryMb: machine.resources.memoryMb,
        diskGb: machine.resources.diskGb,
        autoStopSeconds: machine.autoStopSeconds,
        createdAt: machine.createdAt,
    };
}

async function respond(c: MachinesContext, machine: SmolMachine) {
    const prefix = await ownerPrefix(c.var.auth.requireUser().id);
    return c.json(publicMachine(machine, prefix));
}

const responses = {
    200: { description: "Success" },
    401: { description: "Unauthorized" },
    403: { description: "Machines are not enabled for this account" },
    404: { description: "Machine not found" },
};

export const machinesRoutes = new Hono<Env>()
    .use("/machines", edgeRateLimit)
    .use("/machines/*", edgeRateLimit)
    .use("/machines", auth())
    .use("/machines/*", auth())
    .use("/machines", requireMachineAccess)
    .use("/machines/*", requireMachineAccess)
    .get(
        "/machines",
        describeRoute({
            tags: [TAG],
            summary: "List Machines",
            description: "List the machines owned by the caller.",
            responses,
        }),
        async (c) => {
            const prefix = await ownerPrefix(c.var.auth.requireUser().id);
            const machines = await listOwned(c);
            return c.json({
                data: machines.map((m) => publicMachine(m, prefix)),
            });
        },
    )
    .post(
        "/machines",
        describeRoute({
            tags: [TAG],
            summary: "Create a Machine",
            description:
                "Create a persistent Linux machine from an OCI image and start it. The disk survives stops; processes do not, so put the long-running process in `command`.",
            responses: {
                ...responses,
                409: { description: "A machine with this name exists" },
            },
        }),
        validator("json", CreateMachineSchema),
        async (c) => {
            const input = c.req.valid("json");
            const prefix = await ownerPrefix(c.var.auth.requireUser().id);
            if ((await listOwned(c)).length >= MAX_MACHINES_PER_USER) {
                throw new HTTPException(403, {
                    message: `Machine limit reached (${MAX_MACHINES_PER_USER})`,
                });
            }
            const created = await smolJson<SmolMachine>(
                c,
                "/v1/machines",
                "POST",
                {
                    name: `${prefix}${input.name}`,
                    source: { type: "image", reference: input.image },
                    command: input.command,
                    env: input.env,
                    resources: {
                        cpus: input.cpus,
                        memoryMb: input.memoryMb,
                        diskGb: input.diskGb,
                    },
                    autoStopSeconds: input.autoStopSeconds,
                },
            );
            return respond(
                c,
                await smolJson<SmolMachine>(
                    c,
                    `/v1/machines/${created.id}/start`,
                    "POST",
                ),
            );
        },
    )
    .get(
        "/machines/:name",
        describeRoute({ tags: [TAG], summary: "Get a Machine", responses }),
        async (c) => respond(c, await findOwned(c)),
    )
    .delete(
        "/machines/:name",
        describeRoute({
            tags: [TAG],
            summary: "Delete a Machine",
            description: "Delete the machine and its disk.",
            responses,
        }),
        async (c) => {
            const machine = await findOwned(c);
            await smolJson(c, `/v1/machines/${machine.id}`, "DELETE");
            return c.json({ deleted: true });
        },
    )
    .post(
        "/machines/:name/:action{start|stop}",
        describeRoute({
            tags: [TAG],
            summary: "Start or Stop a Machine",
            description:
                "`stop` powers the machine off and keeps its disk. `start` boots it and runs `command` again.",
            responses,
        }),
        async (c) => {
            const machine = await findOwned(c);
            return respond(
                c,
                await smolJson<SmolMachine>(
                    c,
                    `/v1/machines/${machine.id}/${c.req.param("action")}`,
                    "POST",
                ),
            );
        },
    )
    .post(
        "/machines/:name/exec",
        describeRoute({
            tags: [TAG],
            summary: "Run a Command",
            description:
                "Run a command inside the machine and return its output.",
            responses,
        }),
        validator("json", ExecSchema),
        async (c) => {
            const machine = await findOwned(c);
            const result = await smolJson<{
                stdout: string;
                stderr: string;
                exitCode: number;
                durationMs: number;
            }>(
                c,
                `/v1/machines/${machine.id}/exec`,
                "POST",
                c.req.valid("json"),
            );
            return c.json({
                stdout: result.stdout,
                stderr: result.stderr,
                exitCode: result.exitCode,
                durationMs: result.durationMs,
            });
        },
    )
    .get(
        "/machines/:name/logs",
        describeRoute({
            tags: [TAG],
            summary: "Read Machine Logs",
            description: "Boot and process logs as server-sent events.",
            responses,
        }),
        async (c) => {
            const machine = await findOwned(c);
            const upstream = await smol(c, `/v1/machines/${machine.id}/logs`);
            return new Response(upstream.body, {
                status: upstream.status,
                headers: {
                    "content-type":
                        upstream.headers.get("content-type") ??
                        "text/event-stream",
                },
            });
        },
    );

async function requireMachineAccess(
    c: MachinesContext,
    next: () => Promise<void>,
) {
    if (!c.env.SMOL_API_KEY) {
        throw new HTTPException(503, {
            message: "Machines are not configured",
        });
    }
    c.var.auth.requireUser();
    // A publishable key ships in frontends; it must never reach a shell.
    if (c.var.auth.apiKey?.metadata?.keyType === "publishable") {
        throw new HTTPException(403, {
            message: "Machines require a secret key",
        });
    }
    await next();
}
