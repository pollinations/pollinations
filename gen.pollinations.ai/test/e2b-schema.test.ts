import {
    createExecutionContext,
    waitOnExecutionContext,
} from "cloudflare:test";
import { afterEach, expect, it, vi } from "vitest";
import type { Spec } from "../scripts/generate-apidocs.ts";
import { filterE2bSchema } from "../scripts/sync-e2b-schema.ts";
import { requestExampleErrors } from "../scripts/validate-request-examples.ts";
import snapshot from "../src/docs/e2b-sandboxes.json";
import worker from "../src/index.ts";
import { e2bRoutes } from "../src/routes/e2b.ts";

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

afterEach(() => {
    vi.restoreAllMocks();
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

it("keeps the committed snapshot in step with the sandbox routes", () => {
    // A new or removed route in e2b.ts needs a refresh: npx tsx scripts/sync-e2b-schema.ts
    const operations = Object.entries(snapshot.paths).flatMap(([path, item]) =>
        Object.keys(item)
            .filter((method) => method !== "parameters")
            .map((method) => `${method.toUpperCase()} ${path}`),
    );
    expect(operations.sort()).toEqual(
        e2bRoutes.routes
            .filter(
                ({ method, path }) => method !== "ALL" && path !== "/pricing",
            )
            .map(
                ({ method, path }) =>
                    `${method} /alpha/e2b${path.replace(":id", "{sandboxID}")}`,
            )
            .sort(),
    );
    for (const item of Object.values(snapshot.paths)) {
        for (const [method, op] of Object.entries(item)) {
            if (method === "parameters") continue;
            expect(op).toMatchObject({
                tags: ["Sandboxes API"],
                security: [{ bearerAuth: [] }],
            });
        }
    }
    expect(snapshot.source).toMatch(
        /^https:\/\/raw\.githubusercontent\.com\/e2b-dev\/E2B\/[0-9a-f]{40}\//,
    );
});

it("serves the snapshot in the docs without contacting E2B", async () => {
    const remote = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        Response.json({
            paths: { "/media": { get: { tags: ["Media Storage"] } } },
        }),
    );
    const ctx = createExecutionContext();
    const response = await worker.fetch(
        new Request("https://gen.pollinations.ai/openapi.json"),
        {
            ENTER: {
                fetch: async () =>
                    Response.json({ paths: { "/account/key": { get: {} } } }),
            },
            ENVIRONMENT: "test",
            LOG_LEVEL: "error",
            LOG_FORMAT: "text",
        } as unknown as CloudflareBindings,
        ctx,
    );
    await waitOnExecutionContext(ctx);
    const schema = await response.json<Record<string, unknown>>();
    expect(response.status).toBe(200);
    expect(schema.paths).toHaveProperty("/alpha/e2b/v2/sandboxes");
    expect(schema["x-tagGroups"]).toContainEqual(
        expect.objectContaining({
            name: "Resources",
            tags: expect.arrayContaining(["Sandboxes API"]),
        }),
    );
    expect(requestExampleErrors(schema as Spec)).toEqual([]);
    expect(
        remote.mock.calls.some(([input]) => String(input).includes("e2b-dev")),
    ).toBe(false);
});
