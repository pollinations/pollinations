import { createServer } from "node:http";
import { handleOpenAIWrapperRequest } from "./handler.js";

const port = Number(process.env.PORT ?? 8787);

async function toRequest(incoming) {
    const origin = `http://${incoming.headers.host ?? "127.0.0.1"}`;
    const headers = new Headers();
    for (const [key, value] of Object.entries(incoming.headers)) {
        if (Array.isArray(value)) headers.set(key, value.join(", "));
        else if (value !== undefined) headers.set(key, value);
    }
    return new Request(new URL(incoming.url ?? "/", origin), {
        method: incoming.method,
        headers,
        body:
            incoming.method === "GET" || incoming.method === "HEAD"
                ? undefined
                : incoming,
        duplex: "half",
    });
}

async function writeResponse(outgoing, response) {
    outgoing.writeHead(
        response.status,
        Object.fromEntries(response.headers.entries()),
    );
    if (!response.body) {
        outgoing.end();
        return;
    }
    const reader = response.body.getReader();
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        outgoing.write(value);
    }
    outgoing.end();
}

export async function handle(incoming, outgoing) {
    const response = await handleOpenAIWrapperRequest(
        await toRequest(incoming),
        {
            apiKey: process.env.POLLINATIONS_API_KEY,
            baseModel: process.env.BEE_BASE_MODEL,
            baseUrl: process.env.POLLINATIONS_BASE_URL,
            systemPrompt: process.env.BEE_SYSTEM_PROMPT,
        },
    );
    await writeResponse(outgoing, response);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
    createServer(handle).listen(port, "0.0.0.0", () => {
        process.stdout.write(
            `minimal openai wrapper bee listening on :${port}\n`,
        );
    });
}
