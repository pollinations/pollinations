import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let server: Server;
let resolveHarnessKey: typeof import("./keys.js").resolveHarnessKey;
let resolveHarnessKeyLease: typeof import("./keys.js").resolveHarnessKeyLease;
const requests: string[] = [];
let leaseMode = false;
const previousBaseUrl = process.env.POLLINATIONS_BASE_URL;

beforeAll(async () => {
    server = createServer((request, response) => {
        requests.push(`${request.method} ${request.url}`);
        if (leaseMode && request.method === "GET") {
            response.writeHead(200, { "Content-Type": "application/json" });
            response.end('{"valid":true}');
            return;
        }
        if (leaseMode && request.method === "POST") {
            response.writeHead(200, { "Content-Type": "application/json" });
            response.end('{"id":"key-created","key":"sk_created"}');
            return;
        }
        if (leaseMode && request.method === "DELETE") {
            response.writeHead(200, { "Content-Type": "application/json" });
            response.end('{"success":true}');
            return;
        }
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
    ({ resolveHarnessKey, resolveHarnessKeyLease } = await import("./keys.js"));
});

afterAll(async () => {
    if (previousBaseUrl === undefined) delete process.env.POLLINATIONS_BASE_URL;
    else process.env.POLLINATIONS_BASE_URL = previousBaseUrl;
    await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
    );
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

    it("revokes a newly-created key through its returned id", async () => {
        leaseMode = true;
        requests.length = 0;
        const { setKeyOverride } = await import("../lib/config.js");
        setKeyOverride("sk_account");
        const lease = await resolveHarnessKeyLease(
            { id: "openclaw", label: "OpenClaw", existingKey: null },
            {},
        );
        expect(lease).toMatchObject({ key: "sk_created", created: true });
        await lease.revoke();
        await lease.revoke();
        expect(requests).toEqual([
            "POST /account/keys",
            "DELETE /account/keys/key-created",
        ]);
        leaseMode = false;
    });

    it("does not delete a reused key", async () => {
        leaseMode = true;
        requests.length = 0;
        const lease = await resolveHarnessKeyLease(
            { id: "openclaw", label: "OpenClaw", existingKey: " sk_existing " },
            {},
        );
        expect(lease).toMatchObject({ key: "sk_existing", created: false });
        await lease.revoke();
        expect(requests).toEqual(["GET /account/key"]);
        leaseMode = false;
    });
});
