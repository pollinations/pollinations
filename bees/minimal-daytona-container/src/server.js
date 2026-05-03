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
        skills: [
            { id: "reply", name: "Reply", tags: ["daytona", "container"] },
        ],
    };
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
    return (
        pathname === "/v1/chat/completions" ||
        /^\/bees\/[^/]+\/v1\/chat\/completions$/.test(pathname)
    );
}

function reply(text) {
    turns += 1;
    return {
        text: `Daytona/container bee turn ${turns}: ${text}`,
        turns,
        workspace: process.cwd(),
    };
}

function chatCompletion(body) {
    const agentReply = reply(lastUserText(body.messages));
    return {
        id: `chatcmpl_minimal_daytona_${agentReply.turns}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: body.model ?? "minimal-daytona-container-bee",
        choices: [
            {
                index: 0,
                message: { role: "assistant", content: agentReply.text },
                finish_reason: "stop",
            },
        ],
        metadata: {
            turns: agentReply.turns,
            workspace: agentReply.workspace,
        },
    };
}

export async function handle(req, res) {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/health") {
        return send(res, 200, { status: "ok" });
    }
    if (
        req.method === "GET" &&
        url.pathname === "/.well-known/agent-card.json"
    ) {
        return send(res, 200, agentCard(url.origin));
    }
    if (req.method === "POST" && url.pathname === "/message") {
        const body = await readBody(req);
        return send(res, 200, reply(body.text ?? ""));
    }
    if (req.method === "POST" && isOpenAIChatPath(url.pathname)) {
        const body = await readBody(req);
        return send(res, 200, chatCompletion(body));
    }

    return send(res, 404, { error: "Not found" });
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
    createServer(handle).listen(port, "0.0.0.0", () => {
        process.stdout.write(`minimal daytona bee listening on :${port}\n`);
    });
}
