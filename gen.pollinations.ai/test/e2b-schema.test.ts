import {
    createExecutionContext,
    waitOnExecutionContext,
} from "cloudflare:test";
import { afterEach, expect, it, vi } from "vitest";
import { fetchOpenApiSpec, type Spec } from "../scripts/generate-apidocs.ts";
import { requestExampleErrors } from "../scripts/validate-request-examples.ts";
import worker from "../src/index.ts";
import { e2bRoutes } from "../src/routes/e2b.ts";
import {
    E2B_SCHEMA_URL,
    fetchE2bSchema,
    filterE2bSchema,
} from "../src/routes/e2b-schema.ts";

// A small upstream-shaped document, including routes we must not expose.
// Use the real router to catch drift between its operations and the docs filter.
const paths = Object.fromEntries(
    e2bRoutes.routes
        .filter(({ method, path }) => method !== "ALL" && path !== "/pricing")
        .map(({ path }) => [
            path.replace(":id", "{sandboxID}"),
            {} as Record<string, unknown>,
        ]),
);
for (const { method, path } of e2bRoutes.routes) {
    if (method === "ALL" || path === "/pricing") continue;
    const name = path.includes("connect")
        ? path.startsWith("/v2")
            ? "ConnectSandboxV2"
            : "ConnectSandbox"
        : path.endsWith("/timeout")
          ? "SandboxTimeoutRequest"
          : path.endsWith("/pause")
            ? "SandboxPauseRequest"
            : path.endsWith("/network")
              ? "SandboxNetworkUpdateConfig"
              : path.startsWith("/v2")
                ? "NewSandboxV2"
                : "NewSandbox";
    paths[path.replace(":id", "{sandboxID}")][method.toLowerCase()] = {
        summary: `${method} ${path}`,
        servers: [{ url: "https://api.e2b.app" }],
        security: [{ ApiKeyAuth: [] }],
        ...(method === "POST" || method === "PUT"
            ? {
                  requestBody: {
                      required: true,
                      content: {
                          "application/json": {
                              schema: { $ref: `#/components/schemas/${name}` },
                          },
                      },
                  },
              }
            : {}),
        parameters: path.includes(":id")
            ? [{ $ref: "#/components/parameters/sandboxID" }]
            : [],
        responses: {
            200: {
                description: "OK",
                content: {
                    "application/json": {
                        schema: { $ref: "#/components/schemas/Sandbox" },
                    },
                },
            },
        },
    };
}
paths["/v2/sandboxes"].get = {
    ...(paths["/v2/sandboxes"].get as object),
    parameters: [
        {
            name: "state",
            in: "query",
            style: "form",
            explode: false,
            schema: {
                type: "array",
                example: ["running", "paused"],
                items: { type: "string", enum: ["running", "paused"] },
            },
        },
    ],
};
const upstream = {
    openapi: "3.0.0",
    paths: {
        ...paths,
        "/templates": { get: {} },
        "/v2/sandboxes/{sandboxID}/logs": { get: {} },
    },
    components: {
        parameters: {
            sandboxID: {
                name: "sandboxID",
                in: "path",
                required: true,
                schema: { type: "string" },
            },
        },
        schemas: {
            NewSandbox: {
                properties: {
                    autoPause: { default: false },
                    timeout: { type: "integer", default: 15 },
                    autoResume: {},
                    iam: {},
                    volumeMounts: {},
                    secure: {},
                },
            },
            NewSandboxV2: {
                properties: {
                    autoPause: { default: false },
                    timeout: { type: "integer", default: 300 },
                },
            },
            ConnectSandbox: {
                required: ["timeout"],
                properties: {
                    timeout: { type: "integer" },
                    memory: { type: "boolean" },
                },
            },
            ConnectSandboxV2: {
                properties: {
                    timeout: { type: "integer" },
                    memory: { type: "boolean" },
                },
            },
            ListedSandbox: { properties: { endAt: { type: "string" } } },
            SandboxDetail: { properties: { endAt: { type: "string" } } },
            Sandbox: {
                properties: {
                    domain: { type: "string", nullable: true },
                    metadata: {
                        type: "object",
                        properties: { nullable: { type: "string" } },
                    },
                    child: { $ref: "#/components/schemas/Sandbox" },
                },
            },
            SandboxTimeoutRequest: {
                type: "object",
                required: ["timeout"],
                properties: { timeout: { type: "integer" } },
            },
            SandboxPauseRequest: {
                type: "object",
                properties: { memory: { type: "boolean" } },
            },
            SandboxNetworkUpdateConfig: {
                type: "object",
                properties: {
                    denyOut: { type: "array", items: { type: "string" } },
                    allowOut: { type: "array", items: { type: "string" } },
                },
            },
            Unused: { type: "string" },
        },
    },
};

afterEach(async () => {
    vi.restoreAllMocks();
    const cache = await caches.open("e2b-docs");
    await cache.delete("https://gen.pollinations.ai/__docs/e2b-upstream");
});

it("imports only live routes and referenced schemas, with Pollinations overrides", () => {
    const result = filterE2bSchema(upstream);
    expect(Object.keys(result.paths).sort()).toEqual(
        Object.keys(paths)
            .map((p) => `/alpha/e2b${p}`)
            .sort(),
    );
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("api.e2b.app");
    expect(serialized).not.toContain("ApiKeyAuth");
    expect(result.components.schemas).not.toHaveProperty("E2B_Unused");
    expect(result.components.schemas.E2B_ConnectSandbox).not.toHaveProperty(
        "properties.memory",
    );
    expect(serialized).not.toContain('"volumeMounts"');
    expect(result.components.schemas.E2B_NewSandbox).toMatchObject({
        properties: { autoPause: { default: true }, timeout: { default: 15 } },
    });
    expect(result.components.schemas.E2B_ConnectSandbox).toMatchObject({
        properties: { timeout: { default: 300 } },
    });
    expect(result.components.schemas.E2B_ConnectSandbox).not.toHaveProperty(
        "required",
    );
    expect(result.components.schemas.E2B_Sandbox).toMatchObject({
        properties: {
            domain: { anyOf: [{ type: "string" }, { type: "null" }] },
            metadata: { properties: { nullable: { type: "string" } } },
            child: { $ref: "#/components/schemas/E2B_Sandbox" },
        },
    });
    expect(
        upstream.components.schemas.NewSandbox.properties.autoPause.default,
    ).toBe(false);
    expect(() => filterE2bSchema({ ...upstream, paths: {} })).toThrow(
        "Missing E2B operation",
    );
});

it("revalidates upstream, adopts changes, and keeps the last good reference on failure", async () => {
    const remote = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(
            Response.json(upstream, { headers: { etag: '"one"' } }),
        );
    const first = await fetchE2bSchema();
    expect(first.fresh).toBe(true);
    remote.mockResolvedValueOnce(new Response(null, { status: 304 }));
    expect(await fetchE2bSchema()).toEqual(first);
    expect(remote).toHaveBeenLastCalledWith(
        E2B_SCHEMA_URL,
        expect.objectContaining({ headers: { "If-None-Match": '"one"' } }),
    );
    const updated = structuredClone(upstream);
    updated.components.schemas.NewSandbox.properties.timeout.default = 42;
    remote.mockResolvedValueOnce(
        Response.json(updated, { headers: { etag: '"two"' } }),
    );
    const next = await fetchE2bSchema();
    expect(next.schema?.components.schemas.E2B_NewSandbox).toMatchObject({
        properties: { timeout: { default: 42 } },
    });
    for (const response of [
        new Response("down", { status: 503 }),
        Response.json({ ...upstream, paths: {} }),
    ]) {
        remote.mockResolvedValueOnce(response);
        expect(await fetchE2bSchema()).toEqual({
            schema: next.schema,
            fresh: false,
        });
    }
    remote.mockRejectedValueOnce(new Error("offline"));
    expect(await fetchE2bSchema()).toEqual({
        schema: next.schema,
        fresh: false,
    });
});

it("merges E2B into live docs and blocks regeneration when upstream cannot be refreshed", async () => {
    const remote = vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async (input) =>
            input === E2B_SCHEMA_URL
                ? Response.json(upstream)
                : Response.json({
                      paths: { "/media": { get: { tags: ["Media Storage"] } } },
                  }),
        );
    const ctx = createExecutionContext();
    const env = {
        ENTER: {
            fetch: async () =>
                Response.json({ paths: { "/account/key": { get: {} } } }),
        },
        ENVIRONMENT: "test",
        LOG_LEVEL: "error",
        LOG_FORMAT: "text",
    } as unknown as CloudflareBindings;
    const response = await worker.fetch(
        new Request("https://gen.pollinations.ai/openapi.json"),
        env,
        ctx,
    );
    await waitOnExecutionContext(ctx);
    const schema = await response.json<Record<string, unknown>>();
    expect(response.status).toBe(200);
    expect(schema["x-schema-sources"]).toEqual({
        gen: true,
        enter: true,
        media: true,
        e2b: true,
    });
    expect(schema["x-tagGroups"]).toContainEqual(
        expect.objectContaining({
            name: "Resources",
            tags: expect.arrayContaining(["Sandboxes API"]),
        }),
    );
    expect(schema.paths).toHaveProperty("/alpha/e2b/v2/sandboxes");
    expect(requestExampleErrors(schema as Spec)).toEqual([]);
    remote.mockImplementation(async () => Response.json(schema));
    await expect(
        fetchOpenApiSpec("https://gen.pollinations.ai/openapi.json"),
    ).resolves.toEqual(schema);
    remote.mockRejectedValue(new Error("upstream offline"));
    const coldCtx = createExecutionContext();
    const staleResponse = await worker.fetch(
        new Request("https://gen.pollinations.ai/openapi.json"),
        env,
        coldCtx,
    );
    await waitOnExecutionContext(coldCtx);
    const stale = await staleResponse.json<Record<string, unknown>>();
    expect(staleResponse.status).toBe(200);
    expect(stale.paths).toHaveProperty("/alpha/e2b/v2/sandboxes");
    remote.mockImplementation(async () => Response.json(stale));
    await expect(
        fetchOpenApiSpec("https://gen.pollinations.ai/openapi.json"),
    ).rejects.toThrow("e2b");
});

it("keeps the rest of the docs available on a cold-cache upstream failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    expect(await fetchE2bSchema()).toEqual({ schema: undefined, fresh: false });
});
