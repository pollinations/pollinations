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

function contentToText(content) {
    if (typeof content === "string") return content;
    if (!Array.isArray(content)) return "";
    return content
        .map((part) => (typeof part?.text === "string" ? part.text : ""))
        .filter(Boolean)
        .join("\n");
}

function lastUserText(messages) {
    if (!Array.isArray(messages)) return "";
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        if (messages[index]?.role === "user") {
            return contentToText(messages[index].content);
        }
    }
    return "";
}

function isOpenAIChatPath(pathname) {
    return pathname === "/v1/chat/completions";
}

function chatCompletion(body) {
    const text = `AgentCore bee received: ${lastUserText(body.messages)}`;
    return {
        id: `chatcmpl_minimal_agentcore_${body.session_id ?? "session"}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: body.model ?? "minimal-aws-agentcore-bee",
        choices: [
            {
                index: 0,
                message: { role: "assistant", content: text },
                finish_reason: "stop",
            },
        ],
        metadata: { provider: "aws-agentcore" },
    };
}

export async function handle(req, res) {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/ping") {
        return send(res, 200, {
            status: "Healthy",
            time_of_last_update: Math.floor(Date.now() / 1000),
        });
    }

    if (req.method === "POST" && isOpenAIChatPath(url.pathname)) {
        return send(res, 200, chatCompletion(await readJson(req)));
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
