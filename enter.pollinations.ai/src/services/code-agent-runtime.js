function jsonError(message) {
    return Response.json({ error: { message } }, { status: 500 });
}

async function readMcpResult(response, id) {
    const text = await response.text();
    const messages = response.headers
        .get("content-type")
        ?.includes("text/event-stream")
        ? text
              .replace(/\r\n?/g, "\n")
              .split("\n\n")
              .map((event) =>
                  event
                      .split("\n")
                      .filter((line) => line.startsWith("data:"))
                      .map((line) => line.slice(5).trimStart())
                      .join("\n"),
              )
        : [text];
    for (const data of messages) {
        if (!data || data === "[DONE]") continue;
        const message = JSON.parse(data);
        if (message.id !== id) continue;
        if (message.error) {
            throw new Error(message.error.message || "MCP tool call failed");
        }
        if ("result" in message) return message.result;
    }
    throw new Error("MCP tool call returned no result");
}

function createAgentContext(request, baseUrl) {
    const headers = new Headers(request.headers);
    headers.delete("authorization");
    headers.delete("cookie");
    const safeRequest = new Request(request, { headers });
    const origin = new URL(baseUrl);
    const pollinations = (path, init = {}) => {
        const url = new URL(path, origin);
        if (url.origin !== origin.origin) {
            throw new Error(
                "pollinations() only accepts Pollinations API URLs",
            );
        }
        return fetch(url, init);
    };
    const sendMcp = async (server, message, sessionHeaders = {}) => {
        const response = await pollinations(
            `/mcp/${encodeURIComponent(server)}`,
            {
                method: "POST",
                headers: {
                    accept: "application/json, text/event-stream",
                    "content-type": "application/json",
                    ...sessionHeaders,
                },
                body: JSON.stringify({ jsonrpc: "2.0", ...message }),
            },
        );
        if (!response.ok) {
            throw new Error(`MCP tool call failed (${response.status})`);
        }
        return response;
    };
    // Composio uses session-based MCP; the other hosted servers are stateless.
    let composioSession;
    const initializeComposio = async () => {
        const id = crypto.randomUUID();
        const response = await sendMcp("composio", {
            id,
            method: "initialize",
            params: {
                protocolVersion: "2025-06-18",
                capabilities: {},
                clientInfo: {
                    name: "pollinations-code-agent",
                    version: "1.0.0",
                },
            },
        });
        const result = await readMcpResult(response, id);
        const sessionHeaders = {
            "mcp-protocol-version": result.protocolVersion,
        };
        const sessionId = response.headers.get("mcp-session-id");
        if (sessionId) sessionHeaders["mcp-session-id"] = sessionId;
        const initialized = await sendMcp(
            "composio",
            { method: "notifications/initialized" },
            sessionHeaders,
        );
        await initialized.body?.cancel();
        return sessionHeaders;
    };
    const mcp = async (server, tool, args = {}) => {
        if (typeof server !== "string" || typeof tool !== "string") {
            throw new Error("mcp() requires a server and tool name");
        }
        let sessionHeaders = {};
        if (server === "composio") {
            composioSession ??= initializeComposio();
            sessionHeaders = await composioSession;
        }
        const id = crypto.randomUUID();
        const response = await sendMcp(
            server,
            {
                id,
                method: "tools/call",
                params: { name: tool, arguments: args },
            },
            sessionHeaders,
        );
        return readMcpResult(response, id);
    };
    return { request: safeRequest, pollinations, mcp };
}

export default function createCodeAgentWorker(agent) {
    return {
        async fetch(request, env) {
            try {
                if (typeof agent !== "function") {
                    return jsonError(
                        "Code agent must export a default function",
                    );
                }
                const response = await agent(
                    createAgentContext(request, env.POLLINATIONS_BASE_URL),
                );
                return response instanceof Response
                    ? response
                    : jsonError("Code agent must return a Response");
            } catch {
                console.error("Code agent execution failed");
                return jsonError("Code agent execution failed");
            }
        },
    };
}
