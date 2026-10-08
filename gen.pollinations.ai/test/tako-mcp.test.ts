import { expect, test } from "vitest";
import { handleTakoMcp } from "../src/mcp/tako.ts";

// Exercise the real stateless transport without a provider request.
test("Tako exposes search and returns a zero-cost error without Gateway access", async () => {
    const list = await handleTakoMcp(
        new Request("https://mcp.internal/", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json, text/event-stream",
            },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "tools/list",
            }),
        }),
    );
    expect(list.status).toBe(200);
    expect(await list.text()).toContain("tako_search");
    expect(list.headers.has("x-pollinations-mcp-cost")).toBe(false);

    const failure = await handleTakoMcp(
        new Request("https://mcp.internal/", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json, text/event-stream",
            },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: 2,
                method: "tools/call",
                params: {
                    name: "tako_search",
                    arguments: { query: "test" },
                },
            }),
        }),
    );
    expect(failure.headers.get("x-pollinations-mcp-cost")).toBe("0");
    expect(failure.headers.get("x-pollinations-mcp-status")).toBe("502");
    expect(await failure.text()).toContain('"isError":true');
});
