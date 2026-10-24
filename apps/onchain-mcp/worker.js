import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
    createMCPResponse,
    createTextContent,
} from "../../packages/mcp/src/utils/coreUtils.js";

const CHAINS = {
    ethereum: "https://ethereum-rpc.publicnode.com",
    base: "https://base-rpc.publicnode.com",
    polygon: "https://polygon-bor-rpc.publicnode.com",
    bsc: "https://bsc-rpc.publicnode.com",
    arbitrum: "https://arbitrum-one-rpc.publicnode.com",
    optimism: "https://optimism-rpc.publicnode.com",
};

async function rpcCall(chain, method, params) {
    const rpcUrl = CHAINS[chain];
    if (!rpcUrl) {
        throw new Error(
            `Unsupported chain "${chain}". Supported: ${Object.keys(CHAINS).join(", ")}`,
        );
    }
    const response = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    if (!response.ok) {
        throw new Error(`${chain} RPC returned HTTP ${response.status}`);
    }
    const data = await response.json();
    if (data.error) {
        throw new Error(
            `${chain} RPC error: ${data.error.message ?? JSON.stringify(data.error)}`,
        );
    }
    return data.result;
}

function buildServer() {
    const server = new McpServer(
        { name: "onchain-mcp", title: "Onchain MCP", version: "0.1.0" },
        { capabilities: { tools: {} } },
    );

    server.registerTool(
        "get_balance",
        {
            description:
                "Get the native token balance of an EVM address on a supported chain " +
                "(ethereum, base, polygon, bsc, arbitrum, optimism). Uses public RPCs, no key needed. " +
                "Returns balance in wei and in ETH.",
            inputSchema: {
                address: z
                    .string()
                    .describe(
                        "EVM address, e.g. 0x6B175474E89094C44Da98b954EedeAC495271d0F",
                    ),
                chain: z
                    .enum(Object.keys(CHAINS))
                    .optional()
                    .describe("Chain to query (default ethereum)"),
            },
        },
        async ({ address, chain = "ethereum" }) => {
            const wei = await rpcCall(chain, "eth_getBalance", [
                address,
                "latest",
            ]);
            const eth = BigInt(wei) / 10n ** 18n;
            const remainder = BigInt(wei) % 10n ** 18n;
            const result = {
                chain,
                address,
                balanceWei: wei,
                balanceEth: `${eth}.${remainder.toString().padStart(18, "0").slice(0, 6)}`,
            };
            return createMCPResponse([
                createTextContent(JSON.stringify(result, null, 2)),
            ]);
        },
    );

    server.registerTool(
        "get_tx_status",
        {
            description:
                "Check the status of a transaction by hash on a supported chain. " +
                "Returns block number, hash, from/to, and value. " +
                "If blockNumber is null the transaction is still pending.",
            inputSchema: {
                txHash: z.string().describe("Transaction hash, e.g. 0x..."),
                chain: z
                    .enum(Object.keys(CHAINS))
                    .optional()
                    .describe("Chain to query (default ethereum)"),
            },
        },
        async ({ txHash, chain = "ethereum" }) => {
            const tx = await rpcCall(chain, "eth_getTransactionByHash", [
                txHash,
            ]);
            if (!tx) {
                return createMCPResponse([
                    createTextContent(
                        `Transaction ${txHash} not found on ${chain}.`,
                    ),
                ]);
            }
            const v = BigInt(tx.value ?? "0x0") / 10n ** 18n;
            const rem = BigInt(tx.value ?? "0x0") % 10n ** 18n;
            const result = {
                chain,
                txHash,
                blockNumber: tx.blockNumber ?? null,
                from: tx.from,
                to: tx.to,
                valueEth: `${v}.${rem.toString().padStart(18, "0").slice(0, 6)}`,
                status: tx.blockNumber ? "confirmed-on-chain" : "pending",
            };
            return createMCPResponse([
                createTextContent(JSON.stringify(result, null, 2)),
            ]);
        },
    );

    server.registerTool(
        "get_latest_block",
        {
            description:
                "Get the latest block number on a supported chain. " +
                "Useful to confirm a chain is live or to reason about confirmation lag.",
            inputSchema: {
                chain: z
                    .enum(Object.keys(CHAINS))
                    .optional()
                    .describe("Chain to query (default ethereum)"),
            },
        },
        async ({ chain = "ethereum" }) => {
            const block = await rpcCall(chain, "eth_blockNumber", []);
            const result = {
                chain,
                blockNumberHex: block,
                blockNumber: parseInt(block, 16),
            };
            return createMCPResponse([
                createTextContent(JSON.stringify(result, null, 2)),
            ]);
        },
    );

    return server;
}

const mcpHandler = createMcpHandler(() => buildServer(), {
    legacy: "stateless",
    onerror: (error) => console.error(error),
});

function readBearerToken(request) {
    const authorization = request.headers.get("authorization");
    if (!authorization) return null;

    const [scheme, token] = authorization.trim().split(/\s+/, 2);
    if (scheme?.toLowerCase() !== "bearer" || !token) {
        return null;
    }
    return token;
}

function unauthorizedResponse() {
    return Response.json(
        {
            error: "unauthorized",
            message: "Send a Pollinations API key as a bearer token.",
        },
        {
            status: 401,
            headers: {
                "WWW-Authenticate":
                    'Bearer realm="onchain-mcp.pollinations.ai"',
            },
        },
    );
}

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "onchain-mcp",
                transport: "streamable-http",
                endpoint: "/",
                stateless: true,
            });
        }

        if (url.pathname !== "/") {
            return new Response("Not found", { status: 404 });
        }

        const token = readBearerToken(request);
        if (!token) return unauthorizedResponse();

        if (
            request.method === "POST" &&
            Array.isArray(
                await request
                    .clone()
                    .json()
                    .catch(() => null),
            )
        ) {
            return Response.json(
                {
                    error: "invalid_request",
                    message: "Batch requests are not supported.",
                },
                { status: 400 },
            );
        }

        return mcpHandler.fetch(request, {
            authInfo: {
                token,
                clientId: "pollinations-api-key",
                scopes: [],
            },
        });
    },
};
