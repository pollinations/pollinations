import { createServer } from "node:http";
import { handleAgentCoreRequest } from "./agentcore.js";

const port = Number(process.env.PORT ?? 8080);

async function toRequest(
    incoming: import("node:http").IncomingMessage,
): Promise<Request> {
    const chunks: Buffer[] = [];
    for await (const chunk of incoming) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const body = Buffer.concat(chunks);
    const method = incoming.method ?? "GET";
    const url = `http://${incoming.headers.host ?? `localhost:${port}`}${incoming.url ?? "/"}`;

    return new Request(url, {
        method,
        headers: incoming.headers as HeadersInit,
        body: method === "GET" || method === "HEAD" ? undefined : body,
    });
}

const server = createServer(async (incoming, outgoing) => {
    const response = await handleAgentCoreRequest(await toRequest(incoming));
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
});

server.listen(port, "0.0.0.0", () => {
    process.stdout.write(`agentcore bee listening on :${port}\n`);
});
