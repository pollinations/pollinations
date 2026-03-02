/**
 * HTTP transport for the Pollinations MCP server.
 *
 * Uses Streamable HTTP (MCP spec) with OAuth JWT or API key authentication.
 * Start with: node pollinations-mcp.js --http [--port 3001]
 */

import { randomUUID } from "node:crypto";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { createMcpServer } from "./index.js";
import {
    clearOAuthToken,
    setApiKey,
    setOAuthToken,
} from "./utils/authUtils.js";

const JWKS_URL = "https://enter.pollinations.ai/api/auth/jwks";
const ISSUER = "https://enter.pollinations.ai/api/auth";
const AUDIENCE = [
    "https://gen.pollinations.ai",
    "https://enter.pollinations.ai",
];

// JWKS keyset — jose caches keys automatically
const jwks = createRemoteJWKSet(new URL(JWKS_URL));

/**
 * Verify the Authorization header. Returns auth info or null.
 */
async function verifyToken(req) {
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) return null;
    const token = auth.slice(7);

    // API keys pass through without JWT verification
    if (token.startsWith("pk_") || token.startsWith("sk_")) {
        return { type: "apikey", token };
    }

    // JWT verification against JWKS
    const { payload } = await jwtVerify(token, jwks, {
        issuer: ISSUER,
        audience: AUDIENCE,
    });
    return { type: "oauth", payload, token };
}

/**
 * Auth middleware — verifies token and sets credentials for downstream API calls.
 */
async function authMiddleware(req, res, next) {
    const auth = await verifyToken(req).catch(() => null);
    if (!auth) {
        res.status(401).json({
            jsonrpc: "2.0",
            error: {
                code: -32001,
                message:
                    "Unauthorized: Provide a valid Bearer token (OAuth JWT or API key)",
            },
            id: null,
        });
        return;
    }

    // Set credentials for downstream API calls
    if (auth.type === "apikey") {
        setApiKey(auth.token);
        clearOAuthToken();
    } else {
        setOAuthToken(auth.token);
    }

    req.auth = auth;
    next();
}

/**
 * Start the MCP HTTP server on the given port.
 */
export async function startHttpServer(port = 3001) {
    const app = createMcpExpressApp();

    // Track active transports by session ID
    const transports = {};

    // OAuth Protected Resource metadata (RFC 9728 / MCP spec)
    app.get("/.well-known/oauth-protected-resource", (_req, res) => {
        res.json({
            resource: `http://localhost:${port}`,
            authorization_servers: ["https://enter.pollinations.ai/api/auth"],
            scopes_supported: [
                "openid",
                "profile",
                "generate",
                "read:usage",
                "read:balance",
            ],
        });
    });

    // POST /mcp — initialize or send messages
    app.post("/mcp", authMiddleware, async (req, res) => {
        const sessionId = req.headers["mcp-session-id"];

        try {
            // Existing session — reuse transport
            if (sessionId && transports[sessionId]) {
                await transports[sessionId].handleRequest(req, res, req.body);
                return;
            }

            // New initialization request
            if (!sessionId && isInitializeRequest(req.body)) {
                const transport = new StreamableHTTPServerTransport({
                    sessionIdGenerator: () => randomUUID(),
                    onsessioninitialized: (sid) => {
                        transports[sid] = transport;
                    },
                });

                transport.onclose = () => {
                    const sid = transport.sessionId;
                    if (sid && transports[sid]) {
                        delete transports[sid];
                    }
                };

                const server = createMcpServer();
                await server.connect(transport);
                await transport.handleRequest(req, res, req.body);
                return;
            }

            // Invalid request
            res.status(400).json({
                jsonrpc: "2.0",
                error: {
                    code: -32000,
                    message: "Bad Request: No valid session ID provided",
                },
                id: null,
            });
        } catch (error) {
            console.error("Error handling MCP request:", error);
            if (!res.headersSent) {
                res.status(500).json({
                    jsonrpc: "2.0",
                    error: { code: -32603, message: "Internal server error" },
                    id: null,
                });
            }
        }
    });

    // GET /mcp — SSE stream for server-to-client notifications
    app.get("/mcp", authMiddleware, async (req, res) => {
        const sessionId = req.headers["mcp-session-id"];
        if (!sessionId || !transports[sessionId]) {
            res.status(400).json({ error: "Invalid or missing session ID" });
            return;
        }
        await transports[sessionId].handleRequest(req, res);
    });

    // DELETE /mcp — session termination
    app.delete("/mcp", authMiddleware, async (req, res) => {
        const sessionId = req.headers["mcp-session-id"];
        if (!sessionId || !transports[sessionId]) {
            res.status(400).json({ error: "Invalid or missing session ID" });
            return;
        }
        try {
            await transports[sessionId].handleRequest(req, res);
        } catch (error) {
            console.error("Error handling session termination:", error);
            if (!res.headersSent) {
                res.status(500).json({
                    error: "Error processing session termination",
                });
            }
        }
    });

    app.listen(port, () => {
        console.error(
            `Pollinations MCP Server v2.0.0 running on http://localhost:${port}/mcp`,
        );
        console.error("Transport: Streamable HTTP + OAuth/API key auth");
        console.error("API: https://gen.pollinations.ai");
    });

    // Graceful shutdown
    process.on("SIGINT", async () => {
        for (const sessionId in transports) {
            try {
                await transports[sessionId].close();
                delete transports[sessionId];
            } catch {}
        }
        process.exit(0);
    });
    process.on("SIGTERM", () => process.exit(0));
}
