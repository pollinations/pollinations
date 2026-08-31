import { createServer, type Server } from "node:http";
import {
    afterAll,
    afterEach,
    beforeAll,
    describe,
    expect,
    it,
    vi,
} from "vitest";

let server: Server;
let resolveHarnessKey: typeof import("./keys.js").resolveHarnessKey;
let withHarnessKeyLease: typeof import("./keys.js").withHarnessKeyLease;
let setKeyOverride: typeof import("../lib/config.js").setKeyOverride;
const requests: string[] = [];
const previousBaseUrl = process.env.POLLINATIONS_BASE_URL;
const previousEnterUrl = process.env.POLLINATIONS_ENTER_URL;

beforeAll(async () => {
    server = createServer((request, response) => {
        requests.push(`${request.method} ${request.url}`);
        response.writeHead(503, { "Content-Type": "application/json" });
        response.end('{"error":"temporarily unavailable"}');
    });
    await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
        throw new Error("No test port");
    process.env.POLLINATIONS_BASE_URL = `http://127.0.0.1:${address.port}`;
    process.env.POLLINATIONS_ENTER_URL = `http://127.0.0.1:${address.port}`;
    ({ resolveHarnessKey, withHarnessKeyLease } = await import("./keys.js"));
    ({ setKeyOverride } = await import("../lib/config.js"));
});

afterAll(async () => {
    if (previousBaseUrl === undefined) delete process.env.POLLINATIONS_BASE_URL;
    else process.env.POLLINATIONS_BASE_URL = previousBaseUrl;
    if (previousEnterUrl === undefined)
        delete process.env.POLLINATIONS_ENTER_URL;
    else process.env.POLLINATIONS_ENTER_URL = previousEnterUrl;
    await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
    );
});

afterEach(() => {
    vi.unstubAllGlobals();
    setKeyOverride("");
});

const jsonResponse = (body: unknown, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Bad Request",
    json: async () => body,
    text: async () => JSON.stringify(body),
});

describe("harness keys", () => {
    it("does not mint a replacement when validation is unavailable", async () => {
        await expect(
            resolveHarnessKey(
                {
                    id: "dsh",
                    label: "DeepSeek Harness",
                    existingKey: "sk_existing",
                },
                {},
            ),
        ).rejects.toMatchObject({ status: 503 });
        expect(requests).toEqual(["GET /account/key"]);
    });

    it("revokes a created lease when setup reports configured=false", async () => {
        const revoke = vi.fn(async () => {});

        await expect(
            withHarnessKeyLease(
                { key: "sk_created", created: true, revoke },
                () => ({ configured: false }),
            ),
        ).rejects.toThrow(/configured result/);
        expect(revoke).toHaveBeenCalledOnce();
    });

    it("reconciles a create response without an id using an exact unique name", async () => {
        setKeyOverride("sk_account");
        const calls: {
            url: string;
            method: string;
            body?: Record<string, unknown>;
        }[] = [];
        const created = { id: "new-id", name: "placeholder" };
        vi.stubGlobal(
            "fetch",
            vi.fn(async (url: string, init?: RequestInit) => {
                const method = init?.method ?? "GET";
                const body = init?.body
                    ? (JSON.parse(String(init.body)) as Record<string, unknown>)
                    : undefined;
                calls.push({ url, method, body });
                if (url.endsWith("/api/account/keys")) {
                    if (
                        calls.filter(({ method }) => method === "GET")
                            .length === 1
                    )
                        return jsonResponse({
                            data: [{ id: "existing", name: "old" }],
                        });
                    return jsonResponse({
                        data: [
                            { id: "existing", name: "old" },
                            { ...created, name: String(calls[1].body?.name) },
                        ],
                    });
                }
                if (method === "POST")
                    return jsonResponse({ key: "sk_created" });
                if (method === "DELETE") return jsonResponse({ success: true });
                throw new Error(`unexpected request: ${method} ${url}`);
            }),
        );

        await expect(
            resolveHarnessKey(
                {
                    id: "test-harness",
                    label: "Test Harness",
                    existingKey: null,
                },
                {},
            ),
        ).rejects.toThrow(/without an id/);
        expect(calls.map(({ method, url }) => `${method} ${url}`)).toEqual([
            "GET http://127.0.0.1:" +
                new URL(calls[0].url).port +
                "/api/account/keys",
            expect.stringContaining("POST http://127.0.0.1:"),
            expect.stringContaining("GET http://127.0.0.1:"),
            expect.stringContaining("DELETE http://127.0.0.1:"),
        ]);
        expect(calls[0].url).toContain("/api/account/keys");
        expect(calls.at(-1)?.url).toContain("/account/keys/new-id");
        expect(calls[1].body).toMatchObject({
            name: expect.stringMatching(
                /^polli-harness-test-harness-[0-9a-f-]+$/u,
            ),
            type: "secret",
        });
    });

    it("does not delete an ambiguous matching key during reconciliation", async () => {
        setKeyOverride("sk_account");
        const calls: {
            url: string;
            method: string;
            body?: Record<string, unknown>;
        }[] = [];
        vi.stubGlobal(
            "fetch",
            vi.fn(async (url: string, init?: RequestInit) => {
                const method = init?.method ?? "GET";
                const body = init?.body
                    ? (JSON.parse(String(init.body)) as Record<string, unknown>)
                    : undefined;
                calls.push({ url, method, body });
                if (url.endsWith("/api/account/keys")) {
                    const name = String(calls[1]?.body?.name);
                    return jsonResponse({
                        data:
                            calls.filter(({ method }) => method === "GET")
                                .length === 1
                                ? [{ id: "existing", name: "old" }]
                                : [
                                      { id: "one", name },
                                      { id: "two", name },
                                  ],
                    });
                }
                if (method === "POST")
                    return jsonResponse({ key: "sk_created" });
                throw new Error(`unexpected request: ${method} ${url}`);
            }),
        );

        await expect(
            resolveHarnessKey(
                {
                    id: "test-harness",
                    label: "Test Harness",
                    existingKey: null,
                },
                {},
            ),
        ).rejects.toThrow(/without an id/);
        expect(calls.some(({ method }) => method === "DELETE")).toBe(false);
    });

    it("reconciles a lost create response and never includes the secret in errors", async () => {
        setKeyOverride("sk_account");
        const calls: {
            url: string;
            method: string;
            body?: Record<string, unknown>;
        }[] = [];
        vi.stubGlobal(
            "fetch",
            vi.fn(async (url: string, init?: RequestInit) => {
                const method = init?.method ?? "GET";
                const body = init?.body
                    ? (JSON.parse(String(init.body)) as Record<string, unknown>)
                    : undefined;
                calls.push({ url, method, body });
                if (url.endsWith("/api/account/keys")) {
                    const name = String(calls[1]?.body?.name);
                    return jsonResponse({
                        data:
                            calls.filter(({ method }) => method === "GET")
                                .length === 1
                                ? []
                                : [{ id: "created-after-timeout", name }],
                    });
                }
                if (method === "POST") throw new Error("create response lost");
                if (method === "DELETE") return jsonResponse({ success: true });
                throw new Error(`unexpected request: ${method} ${url}`);
            }),
        );

        await expect(
            resolveHarnessKey(
                {
                    id: "test-harness",
                    label: "Test Harness",
                    existingKey: null,
                },
                {},
            ),
        ).rejects.toThrow("create response lost");
        expect(calls.some(({ method }) => method === "DELETE")).toBe(true);
        expect(JSON.stringify(calls)).not.toContain("sk_created");
    });
});
