import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { streamSimple as streamSimpleOpenAICompletions } from "/opt/pi/node_modules/@earendil-works/pi-ai/dist/api/openai-completions.js";
import { Type } from "/opt/pi/node_modules/typebox/build/index.mjs";
import { mcpResult } from "./core.js";

// A supported Pi extension. Pi and its built-in coding tools remain upstream code.
// The browser performs HTTPS; the WASIX guest never receives an account key.
export default async function (pi) {
    const bridgeFetch = async (input, init = {}) => {
        const url =
            typeof input === "string" ? input : input.url || String(input);
        const id = randomUUID();
        const dir = "/workspace/.bridge";
        await mkdir(dir, { recursive: true });
        const path = `${dir}/${id}`;
        const request = {
            url,
            method: init.method || input.method || "GET",
            body: init.body || null,
        };
        await writeFile(`${path}.tmp`, JSON.stringify(request));
        await rename(`${path}.tmp`, `${path}.request`);
        while (true) {
            if (init.signal?.aborted) throw new Error("Request cancelled");
            let result;
            try {
                result = JSON.parse(await readFile(`${path}.response`, "utf8"));
            } catch (error) {
                if (error.code !== "ENOENT") throw error;
            }
            if (result) {
                await unlink(`${path}.response`);
                if (result.error) throw new Error(result.error);
                return new Response(result.body, {
                    status: result.status,
                    headers: result.headers,
                });
            }
            await new Promise((resolve) => setTimeout(resolve, 40));
        }
    };
    const config = JSON.parse(
        await readFile("/workspace/.pi/models.json", "utf8"),
    ).providers.pollinations;
    pi.registerProvider("pollinations", {
        ...config,
        streamSimple: (model, context, options) =>
            streamSimpleOpenAICompletions(model, context, {
                ...options,
                fetch: bridgeFetch,
            }),
    });
    const tools = JSON.parse(
        await readFile("/workspace/.pi/tools.json", "utf8"),
    );
    const call = async (server, name, args, signal) => {
        const response = await bridgeFetch(
            `https://gen.pollinations.ai/mcp/${server}`,
            {
                method: "POST",
                signal,
                body: JSON.stringify({
                    jsonrpc: "2.0",
                    id: randomUUID(),
                    method: "tools/call",
                    params: { name, arguments: args },
                }),
            },
        );
        const result = mcpResult(
            await response.text(),
            response.headers.get("content-type") || "",
        );
        return {
            content: result.content || [
                { type: "text", text: JSON.stringify(result) },
            ],
            details: { source: `Pollinations ${server} MCP` },
        };
    };
    if (tools.exa) {
        pi.registerTool({
            name: "web_search_exa",
            label: "Exa web search",
            description:
                "Search the live web for source-based facts. Cite returned URLs and distinguish source facts from inference. Paid Pollinations Exa MCP call.",
            parameters: Type.Object({
                query: Type.String(),
                numResults: Type.Optional(
                    Type.Number({ minimum: 1, maximum: 5 }),
                ),
            }),
            execute: (_id, params, signal) =>
                call(
                    "exa",
                    "web_search_exa",
                    { query: params.query, numResults: params.numResults || 3 },
                    signal,
                ),
        });
        pi.registerTool({
            name: "web_fetch_exa",
            label: "Exa page reading",
            description:
                "Read public source pages returned by search. Paid Pollinations Exa MCP call.",
            parameters: Type.Object({
                urls: Type.Array(Type.String(), { minItems: 1, maxItems: 3 }),
            }),
            execute: (_id, params, signal) =>
                call(
                    "exa",
                    "web_fetch_exa",
                    { urls: params.urls, maxCharacters: 4000 },
                    signal,
                ),
        });
    }
    if (tools.computer)
        pi.registerTool({
            name: "computer_bash",
            label: "Remote Computer MCP",
            description:
                "Run Bash in the user's separate persistent Pollinations cloud workspace. This is NOT the local browser project. Use only for explicitly requested remote work. Node and Python are unavailable. Paid MCP call.",
            parameters: Type.Object({ command: Type.String() }),
            execute: (_id, params, signal) =>
                call(
                    "computer",
                    "bash",
                    { command: params.command, cwd: "/workspace/pi-workbench" },
                    signal,
                ),
        });
}
