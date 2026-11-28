import { DynamicWorkerExecutor, jsonSchemaToType } from "@cloudflare/codemode";
import { createMcpHandler, McpServer, z } from "../../packages/mcp/src/sdk.js";
import { discoveryTools } from "../../packages/mcp/src/services/discoveryService.js";
import { imageTools } from "../../packages/mcp/src/services/imageService.js";

const MAX_CALLS = 4;
const MAX_CODE_CHARS = 16_384;
const MAX_RESULT_CHARS = 32_768;
const TIMEOUT_MS = 180_000;

// Both handlers return their Gen JSON as a text block. generateImage also
// includes a resource link for MCP clients. Scripts use the JSON data[].url.
const tools = new Map(
    [...discoveryTools, ...imageTools]
        .filter(([name]) => name === "listModels" || name === "generateImage")
        .map(([name, , shape, handle]) => [
            name,
            { schema: z.object(shape), handle },
        ]),
);
const signatures = Array.from(tools, ([name, { schema }]) =>
    jsonSchemaToType(z.toJSONSchema(schema), `${name}Input`),
).join("\n");
const description = `Run a JavaScript async function, e.g. async () => (await pollinations.listModels({type: "image", limit: 3})).map(m => m.name). Return a JSON value and await all calls. pollinations.listModels(listModelsInput) returns the live model array with names and pricing. pollinations.generateImage(generateImageInput) bills your key and returns the image API JSON with data[0].url. Up to ${MAX_CALLS} calls per execution, including failures. Rejoin a generation by sending identical image parameters.\n${signatures}`;

async function runCode(loader, code, context) {
    const executor = new DynamicWorkerExecutor({
        // The executor accepts a WorkerLoader. Set the isolate's CPU budget
        // on its WorkerCode independently of the wall time allowed for images.
        loader: {
            load: (config) =>
                loader.load({ ...config, limits: { cpuMs: 100 } }),
        },
        timeout: TIMEOUT_MS,
        globalOutbound: null,
    });
    let calls = 0;
    let active = true;
    const binding = {
        async callTool(name, input) {
            if (!active) throw new Error("Code execution has ended");
            if (++calls > MAX_CALLS)
                throw new Error(
                    `Limit of ${MAX_CALLS} tool calls per execution`,
                );
            const tool = tools.get(name);
            if (!tool) throw new Error(`Unknown Pollinations tool: ${name}`);
            const result = await tool.handle(tool.schema.parse(input), context);
            return JSON.parse(
                result.content.find((block) => block.type === "text").text,
            );
        },
    };
    let timer;
    try {
        // Enforce wall time in the host as well as inside the dynamic isolate.
        const deadline = new Promise((_, reject) => {
            timer = setTimeout(
                () => reject(new Error("Code execution timed out")),
                TIMEOUT_MS,
            );
        });
        const { result, error } = await Promise.race([
            executor.execute(code, [], {
                connectors: [{ name: "pollinations", binding }],
            }),
            deadline,
        ]);
        if (error) throw new Error(error);
        const text = JSON.stringify(result);
        if (text === undefined)
            throw new Error("Return a JSON value from the code function");
        if (text.length > MAX_RESULT_CHARS)
            throw new Error(
                `Return at most ${MAX_RESULT_CHARS} characters of JSON`,
            );
        return { content: [{ type: "text", text }] };
    } catch (error) {
        return {
            isError: true,
            content: [
                {
                    type: "text",
                    text: String(error.message ?? error).slice(
                        0,
                        MAX_RESULT_CHARS,
                    ),
                },
            ],
        };
    } finally {
        active = false;
        clearTimeout(timer);
    }
}

export default {
    fetch(request, env) {
        const token = request.headers
            .get("authorization")
            ?.match(/^Bearer\s+(\S+)$/i)?.[1];
        if (!token)
            return new Response("Bearer token required", { status: 401 });
        const handler = createMcpHandler(
            () => {
                const server = new McpServer({
                    name: "pollinations-code",
                    version: "0.1.0",
                });
                server.registerTool(
                    "code",
                    {
                        description,
                        inputSchema: z.object({
                            code: z.string().min(1).max(MAX_CODE_CHARS),
                        }),
                    },
                    ({ code }, context) => runCode(env.LOADER, code, context),
                );
                return server;
            },
            { legacy: "stateless" },
        );
        return handler.fetch(request, {
            authInfo: { token, clientId: "pollinations-api-key", scopes: [] },
        });
    },
};
