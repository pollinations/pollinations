import { createServer, type IncomingMessage } from "node:http";
import { ask } from "./agent";

const PORT = Number(process.env.RUNTIME_PORT ?? 3003);

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const body = Buffer.concat(chunks).toString("utf8");
  return body.length === 0 ? {} : JSON.parse(body);
}

const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "catgpt-pi-runtime" }));
    return;
  }

  if (req.method === "POST" && req.url === "/inbound") {
    try {
      const body = (await readJson(req)) as {
        conversationId: string;
        question: string;
        imageUrl?: string;
      };
      const auth = req.headers.authorization;
      const apiKey =
        typeof auth === "string" && auth.startsWith("Bearer ") ? auth.slice(7) : undefined;

      const turn = await ask(body.conversationId, body.question, body.imageUrl, apiKey);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(turn));
    } catch (err) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(
        JSON.stringify({ error: err instanceof Error ? err.message : "unknown error" }),
      );
    }
    return;
  }

  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "Not Found" }));
});

server.listen(PORT, () => {
  console.log(`[pi-agent-core] catgpt runtime listening on http://127.0.0.1:${PORT}`);
});
