import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

// Built with String.fromCharCode so no literal HTML entity ever appears in
// this source: the file-write transport unescapes standard entities.
const AMP = String.fromCharCode(38);

function decodeEntities(text) {
    return String(text)
        .replace(new RegExp(`${AMP}quot;`, "g"), '"')
        .replace(new RegExp(`${AMP}lt;`, "g"), "<")
        .replace(new RegExp(`${AMP}gt;`, "g"), ">")
        .replace(new RegExp(`${AMP}#([0-9]+);`, "g"), (_match, code) =>
            String.fromCharCode(Number(code)),
        )
        .replace(new RegExp(`${AMP}#x([0-9a-fA-F]+);`, "g"), (_match, code) =>
            String.fromCharCode(Number.parseInt(code, 16)),
        )
        .replace(new RegExp(`${AMP}amp;`, "g"), AMP);
}

function shuffle(values) {
    const shuffled = [...values];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

function clampAmount(amount) {
    if (amount === undefined) return 10;
    return Math.min(50, Math.max(1, Math.trunc(amount)));
}

const RESPONSE_CODE_MESSAGES = {
    1: "Open Trivia DB returned no results for these filters.",
    2: "Open Trivia DB rejected a parameter.",
    3: "Open Trivia DB reported a session token problem.",
    4: "Open Trivia DB reported a session token problem.",
};

function textContent(value) {
    return {
        content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    };
}

async function fetchTriviaQuestions({ amount, category, difficulty, type }) {
    const url = new URL("https://opentdb.com/api.php");
    url.searchParams.set("amount", String(clampAmount(amount)));
    if (category !== undefined)
        url.searchParams.set("category", String(category));
    if (difficulty !== undefined)
        url.searchParams.set("difficulty", difficulty);
    if (type !== undefined) url.searchParams.set("type", type);
    // Keyless upstream: no init argument, so no Authorization or Cookie
    // header is ever sent, and the caller's Pollinations key stays here.
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(
            `Open Trivia DB request failed with status ${response.status}.`,
        );
    }
    const data = await response.json();
    if (data.response_code !== 0) {
        throw new Error(
            RESPONSE_CODE_MESSAGES[data.response_code] ??
                `Open Trivia DB returned response_code ${data.response_code}.`,
        );
    }
    return data.results.map((question) => ({
        question: decodeEntities(question.question),
        answers: shuffle([
            ...question.incorrect_answers.map(decodeEntities),
            decodeEntities(question.correct_answer),
        ]),
        correct_answer: decodeEntities(question.correct_answer),
        category: decodeEntities(question.category),
        difficulty: question.difficulty,
        type: question.type,
    }));
}

async function fetchTriviaCategories() {
    // Keyless upstream: no init argument, so no Authorization or Cookie
    // header is ever sent, and the caller's Pollinations key stays here.
    const response = await fetch(
        new URL("https://opentdb.com/api_category.php"),
    );
    if (!response.ok) {
        throw new Error(
            `Open Trivia DB request failed with status ${response.status}.`,
        );
    }
    const data = await response.json();
    return data.trivia_categories.map((category) => ({
        id: category.id,
        name: decodeEntities(category.name),
    }));
}

function buildServer() {
    const server = new McpServer(
        { name: "trivia-mcp", title: "Trivia MCP", version: "0.1.0" },
        { capabilities: { tools: {} } },
    );
    server.registerTool(
        "trivia_questions",
        {
            description:
                "Fetch trivia questions by category, difficulty, and type from Open Trivia DB, with shuffled answers and decoded text.",
            inputSchema: {
                amount: z
                    .number()
                    .optional()
                    .describe("Number of questions, 1-50 (default 10)."),
                category: z
                    .number()
                    .int()
                    .optional()
                    .describe(
                        "Open Trivia DB category id; see trivia_categories.",
                    ),
                difficulty: z.enum(["easy", "medium", "hard"]).optional(),
                type: z.enum(["multiple", "boolean"]).optional(),
            },
        },
        async (args) => textContent(await fetchTriviaQuestions(args)),
    );
    server.registerTool(
        "trivia_categories",
        {
            description:
                "List Open Trivia DB category ids and names for trivia_questions.",
            inputSchema: {},
        },
        async () => textContent(await fetchTriviaCategories()),
    );
    return server;
}

const mcpHandler = createMcpHandler(() => buildServer(), {
    legacy: "stateless",
    onerror: (error) => console.error(error),
});

function readBearerToken(request) {
    const authorization = request.headers.get("authorization");
    if (!authorization) return null;

    const [scheme, token] = authorization.trim().split(/\s+/, 2);
    if (scheme?.toLowerCase() !== "bearer" || !token) {
        return null;
    }
    return token;
}

function unauthorizedResponse() {
    return Response.json(
        {
            error: "unauthorized",
            message: "Send a Pollinations API key as a bearer token.",
        },
        {
            status: 401,
            headers: {
                "WWW-Authenticate": 'Bearer realm="trivia-mcp.pollinations.ai"',
            },
        },
    );
}

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "trivia-mcp",
                transport: "streamable-http",
                endpoint: "/",
                stateless: true,
            });
        }

        if (url.pathname !== "/") {
            return new Response("Not found", { status: 404 });
        }

        const token = readBearerToken(request);
        if (!token) return unauthorizedResponse();

        if (
            request.method === "POST" &&
            Array.isArray(
                await request
                    .clone()
                    .json()
                    .catch(() => null),
            )
        ) {
            return Response.json(
                {
                    error: "invalid_request",
                    message: "Batch requests are not supported.",
                },
                { status: 400 },
            );
        }

        return mcpHandler.fetch(request, {
            authInfo: {
                token,
                clientId: "pollinations-api-key",
                scopes: [],
            },
        });
    },
};
