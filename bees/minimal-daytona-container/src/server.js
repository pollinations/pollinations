import { createServer } from "node:http";

const port = Number(process.env.PORT ?? 8787);
let turns = 0;

function send(res, status, data, headers = {}) {
    res.writeHead(status, {
        "content-type": "application/json; charset=utf-8",
        ...headers,
    });
    res.end(JSON.stringify(data));
}

async function readBody(req) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    if (chunks.length === 0) return {};
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function agentCard(origin) {
    return {
        protocolVersion: "0.3.0",
        name: "Minimal Daytona Bee",
        description: "Container/workspace reference bee.",
        url: `${origin}/message`,
        preferredTransport: "HTTP",
        capabilities: { streaming: false },
        skills: [{ id: "reply", name: "Reply", tags: ["daytona", "container"] }],
    };
}

export async function handle(req, res) {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/health") {
        return send(res, 200, { status: "ok" });
    }
    if (req.method === "GET" && url.pathname === "/.well-known/agent-card.json") {
        return send(res, 200, agentCard(url.origin));
    }
    if (req.method === "POST" && url.pathname === "/message") {
        const body = await readBody(req);
        turns += 1;
        return send(res, 200, {
            text: `Daytona/container bee turn ${turns}: ${body.text ?? ""}`,
            turns,
            workspace: process.cwd(),
        });
    }

    return send(res, 404, { error: "Not found" });
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
    createServer(handle).listen(port, "0.0.0.0", () => {
        process.stdout.write(`minimal daytona bee listening on :${port}\n`);
    });
}
