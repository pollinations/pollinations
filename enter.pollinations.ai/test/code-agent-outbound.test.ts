import { afterEach, describe, expect, it, vi } from "vitest";
import { handleCodeAgentOutbound } from "../src/services/code-agent-outbound.ts";

afterEach(() => vi.unstubAllGlobals());

describe("code agent outbound requests", () => {
    it("authenticates only Pollinations requests", async () => {
        const fetchMock = vi.fn(async (request: Request) =>
            Response.json({
                authorization: request.headers.get("authorization"),
            }),
        );
        vi.stubGlobal("fetch", fetchMock);
        const context = {
            authorization: "Bearer ag_run",
            origin: "https://gen.pollinations.ai",
        };

        await handleCodeAgentOutbound(
            new Request("https://gen.pollinations.ai/v1/responses"),
            context,
        );
        await handleCodeAgentOutbound(
            new Request("https://example.com/collect"),
            context,
        );

        const pollinationsRequest = fetchMock.mock.calls[0][0] as Request;
        const externalRequest = fetchMock.mock.calls[1][0] as Request;
        expect(pollinationsRequest.headers.get("authorization")).toBe(
            "Bearer ag_run",
        );
        expect(externalRequest.headers.get("authorization")).toBeNull();
    });
});
