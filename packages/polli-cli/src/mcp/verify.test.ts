import { describe, expect, it } from "vitest";
import { serverUrl } from "./catalog.js";
import type { FetchLike, HttpRequest } from "./verify.js";
import { describeVerify, verifyServer } from "./verify.js";

const URL_POLLINATIONS = serverUrl("pollinations");

/** Minimal stand-in for the parts of `Response` that the check uses. */
const reply = (body: string, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
});

const handshake =
    '{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-06-18",' +
    '"serverInfo":{"name":"pollinations","version":"1.0.0"}}}';

const answerWith =
    (body: string, status = 200): FetchLike =>
    async () =>
        reply(body, status);

describe("verifyServer", () => {
    it("names the server from a JSON handshake", async () => {
        const result = await verifyServer(URL_POLLINATIONS, "sk_key", {
            fetchImpl: answerWith(handshake),
        });
        expect(result.outcome).toBe("ok");
        expect(result.serverName).toBe("pollinations");
    });

    it("reads the handshake out of an SSE frame", async () => {
        const body = `event: message\ndata: ${handshake}\n\n`;
        const result = await verifyServer(URL_POLLINATIONS, "sk_key", {
            fetchImpl: answerWith(body),
        });
        expect(result.outcome).toBe("ok");
        expect(result.serverName).toBe("pollinations");
    });

    it("sends the bearer key with an initialize request", async () => {
        const seen: { url?: string; init?: HttpRequest } = {};
        const fetchImpl: FetchLike = async (url, init) => {
            seen.url = url;
            seen.init = init;
            return reply(handshake);
        };
        await verifyServer(URL_POLLINATIONS, "sk_key", { fetchImpl });
        expect(seen.url).toBe(URL_POLLINATIONS);
        const headers = seen.init?.headers ?? {};
        expect(headers.Authorization).toBe("Bearer sk_key");
        expect(headers.Accept).toContain("text/event-stream");
        const body = JSON.parse(String(seen.init?.body));
        expect(body.method).toBe("initialize");
        expect(body.params.clientInfo.name).toBe("polli");
    });

    it("leaves the key out when there is none to send", async () => {
        const seen: { init?: HttpRequest } = {};
        const fetchImpl: FetchLike = async (_url, init) => {
            seen.init = init;
            return reply(handshake);
        };
        await verifyServer(URL_POLLINATIONS, null, { fetchImpl });
        expect(seen.init?.headers.Authorization).toBeUndefined();
    });

    it("reports a rejected key instead of a crash", async () => {
        const result = await verifyServer(URL_POLLINATIONS, "sk_bad", {
            fetchImpl: answerWith("Unauthorized", 401),
        });
        expect(result.outcome).toBe("unauthorized");
        expect(result.detail).toContain("401");
    });

    it("reports an unreachable host", async () => {
        const fetchImpl: FetchLike = async () => {
            throw new Error("getaddrinfo ENOTFOUND");
        };
        const result = await verifyServer(URL_POLLINATIONS, "sk_key", {
            fetchImpl,
        });
        expect(result.outcome).toBe("unreachable");
        expect(result.detail).toContain("ENOTFOUND");
    });

    it("flags a body that is not JSON-RPC", async () => {
        const result = await verifyServer(URL_POLLINATIONS, "sk_key", {
            fetchImpl: answerWith("<html>blocked</html>"),
        });
        expect(result.outcome).toBe("invalid");
    });

    it("flags a JSON-RPC error reply", async () => {
        const result = await verifyServer(URL_POLLINATIONS, "sk_key", {
            fetchImpl: answerWith(
                '{"jsonrpc":"2.0","id":1,"error":{"code":-32600}}',
            ),
        });
        expect(result.outcome).toBe("invalid");
    });
});

describe("describeVerify", () => {
    it("names the server when the handshake worked", () => {
        expect(
            describeVerify({ outcome: "ok", serverName: "pollinations" }),
        ).toBe("ok (pollinations)");
    });

    it("keeps the detail for failing outcomes", () => {
        expect(
            describeVerify({ outcome: "unauthorized", detail: "HTTP 401" }),
        ).toBe("key rejected: HTTP 401");
    });
});
