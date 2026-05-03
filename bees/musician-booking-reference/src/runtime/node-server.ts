import { createServer } from "node:http";
import { createEnterByopAuthorizer } from "../providers/enter/index.js";
import { handleBeeRequest } from "./http.js";

const port = Number(process.env.PORT ?? 8787);
const authorize = process.env.BYOP_CLIENT_ID
    ? createEnterByopAuthorizer({
          clientId: process.env.BYOP_CLIENT_ID,
          redirectUri:
              process.env.BYOP_REDIRECT_URI ??
              `http://localhost:${port}/byop/callback`,
          enterBaseUrl:
              process.env.ENTER_BASE_URL ?? "https://enter.pollinations.ai",
      })
    : undefined;

async function toRequest(
    incoming: import("node:http").IncomingMessage,
): Promise<Request> {
    const chunks: Buffer[] = [];
    for await (const chunk of incoming) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const body = Buffer.concat(chunks);
    const url = `http://${incoming.headers.host ?? `localhost:${port}`}${incoming.url ?? "/"}`;
    const method = incoming.method ?? "GET";

    return new Request(url, {
        method,
        headers: incoming.headers as HeadersInit,
        body: method === "GET" || method === "HEAD" ? undefined : body,
    });
}

const server = createServer(async (incoming, outgoing) => {
    try {
        const response = await handleBeeRequest(await toRequest(incoming), {
            authorize,
        });
        outgoing.writeHead(
            response.status,
            Object.fromEntries(response.headers),
        );
        outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch {
        outgoing.writeHead(500, {
            "content-type": "application/json; charset=utf-8",
        });
        outgoing.end(JSON.stringify({ error: "Internal error" }));
    }
});

server.listen(port, () => {
    process.stdout.write(`musician-booking bee listening on :${port}\n`);
});
