import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let server: Server;
let resolveHarnessKey: typeof import("./keys.js").resolveHarnessKey;
const requests: string[] = [];
const previousBaseUrl = process.env.POLLINATIONS_BASE_URL;

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
    ({ resolveHarnessKey } = await import("./keys.js"));
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
});
