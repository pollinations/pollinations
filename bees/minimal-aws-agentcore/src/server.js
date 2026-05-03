import { createServer } from "node:http";

const port = Number(process.env.PORT ?? 8080);

function send(res, status, data, headers = {}) {
    res.writeHead(status, {
        "content-type": "application/json; charset=utf-8",
        ...headers,
    });
    res.end(JSON.stringify(data));
}

async function readJson(req) {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    if (chunks.length === 0) return {};
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export async function handle(req, res) {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/ping") {
        return send(res, 200, {
            status: "Healthy",
            time_of_last_update: Math.floor(Date.now() / 1000),
        });
    }

    if (req.method === "POST" && url.pathname === "/invocations") {
        const body = await readJson(req);
        return send(res, 200, {
            response: `AgentCore bee received: ${body.prompt ?? ""}`,
            status: "success",
            session_id: body.session_id ?? "session",
            metadata: { provider: "aws-agentcore" },
        });
    }

    return send(res, 404, { error: "Not found" });
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
    createServer(handle).listen(port, "0.0.0.0", () => {
        process.stdout.write(`minimal agentcore bee listening on :${port}\n`);
    });
}
