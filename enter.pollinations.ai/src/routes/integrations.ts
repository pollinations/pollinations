import { validator } from "@shared/middleware/validator.ts";
import { getPublicOrigin } from "@shared/public-origin.ts";
import { MCP_USER_ID_HEADER } from "@shared/registry/mcp.ts";
import { type Context, Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import type { Env } from "../env.ts";
import { type AuthEnv, auth } from "../middleware/auth.ts";
import { requireAccountPermission } from "./account-permissions.ts";

const ConnectionSchema = z.object({
    id: z.string(),
    toolkit: z.string(),
    alias: z.string().nullable(),
    status: z.string(),
});
const ToolkitSchema = z.object({
    slug: z.string(),
    name: z.string(),
    description: z.string(),
    logo: z.string().nullable(),
});
const SearchSchema = z.object({
    search: z.string().trim().max(100).optional(),
});
const ConnectSchema = z
    .object({
        toolkit: z
            .string()
            .trim()
            .min(1)
            .max(100)
            .regex(/^[a-z0-9_-]+$/i),
    })
    .strict();

function composioRequest(
    c: Context<Env & AuthEnv>,
    path: string,
    init?: RequestInit,
) {
    const user = c.var.auth.requireUser();
    const headers = new Headers(init?.headers);
    headers.set(MCP_USER_ID_HEADER, user.id);
    if (init?.body) headers.set("Content-Type", "application/json");
    return c.env.COMPOSIO_MCP.fetch(
        new Request(`https://composio.internal${path}`, {
            ...init,
            headers,
        }),
    );
}

async function forward(response: Response): Promise<Response> {
    if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
            message?: string;
        } | null;
        throw new HTTPException(response.status as ContentfulStatusCode, {
            message: body?.message || "Connected apps request failed",
        });
    }
    return new Response(response.body, response);
}

export const integrationsRoutes = new Hono<Env>()
    .use(auth({ allowSessionCookie: true, allowApiKey: true }))
    .use("*", async (c, next) => {
        c.var.auth.requireUser();
        requireAccountPermission(c.var.auth.apiKey, "keys");
        await next();
    })
    .get(
        "/",
        describeRoute({
            tags: ["🔗 Account"],
            summary: "List Connected Apps",
            responses: {
                200: {
                    description: "Connected app accounts",
                    content: {
                        "application/json": {
                            schema: resolver(
                                z.object({ data: z.array(ConnectionSchema) }),
                            ),
                        },
                    },
                },
            },
        }),
        async (c) => await forward(await composioRequest(c, "/connections")),
    )
    .get(
        "/toolkits",
        describeRoute({
            tags: ["🔗 Account"],
            summary: "Search Connectable Apps",
            responses: {
                200: {
                    description: "Connectable apps",
                    content: {
                        "application/json": {
                            schema: resolver(
                                z.object({ data: z.array(ToolkitSchema) }),
                            ),
                        },
                    },
                },
            },
        }),
        validator("query", SearchSchema),
        async (c) => {
            const search = c.req.valid("query").search;
            const query = search ? `?search=${encodeURIComponent(search)}` : "";
            return await forward(await composioRequest(c, `/toolkits${query}`));
        },
    )
    .post(
        "/",
        describeRoute({
            tags: ["🔗 Account"],
            summary: "Connect App",
            responses: {
                200: { description: "Hosted authentication URL" },
            },
        }),
        validator("json", ConnectSchema),
        async (c) => {
            const callbackUrl = new URL("/account", getPublicOrigin(c));
            callbackUrl.searchParams.set("connected", "true");
            return await forward(
                await composioRequest(c, "/connections", {
                    method: "POST",
                    body: JSON.stringify({
                        toolkit: c.req.valid("json").toolkit,
                        callbackUrl: callbackUrl.toString(),
                    }),
                }),
            );
        },
    )
    .delete(
        "/:id",
        describeRoute({
            tags: ["🔗 Account"],
            summary: "Disconnect App",
            responses: { 204: { description: "App disconnected" } },
        }),
        async (c) =>
            await forward(
                await composioRequest(
                    c,
                    `/connections/${encodeURIComponent(c.req.param("id"))}`,
                    { method: "DELETE" },
                ),
            ),
    );
