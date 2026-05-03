const DEFAULT_BASE_MODEL = "openai";
const DEFAULT_BASE_URL = "https://gen.pollinations.ai";
export const DEFAULT_SYSTEM_PROMPT =
    "You are a concise Pollinations bee. Answer helpfully, be direct, and keep responses short unless the user asks for detail.";

function json(data, init = {}) {
    const headers = new Headers(init.headers);
    headers.set("content-type", "application/json; charset=utf-8");
    return new Response(JSON.stringify(data), { ...init, headers });
}

function errorResponse(status, code, message, hint, headers = {}) {
    return json({ error: { code, message, hint } }, { status, headers });
}

function isOpenAIChatPath(pathname) {
    return (
        pathname === "/v1/chat/completions" ||
        /^\/bees\/[^/]+\/v1\/chat\/completions$/.test(pathname)
    );
}

export function buildUpstreamChatBody(body, options = {}) {
    const messages = Array.isArray(body.messages) ? body.messages : [];
    return {
        ...body,
        model: options.baseModel ?? DEFAULT_BASE_MODEL,
        messages: [
            {
                role: "system",
                content: options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
            },
            ...messages.filter((message) => message?.role !== "system"),
        ],
    };
}

function upstreamErrorResponse(upstream) {
    if (upstream.status === 401 || upstream.status === 403) {
        return errorResponse(
            upstream.status,
            "upstream_auth_failed",
            "The base Pollinations model rejected the forwarded key.",
            "Check that the caller key can use the wrapped base model.",
        );
    }
    if (upstream.status === 402) {
        return errorResponse(
            402,
            "insufficient_pollen",
            "The forwarded key does not have enough Pollen for the base model.",
            "Top up Pollen or switch this bee to author-pays billing.",
        );
    }
    if (upstream.status === 429) {
        const headers = {};
        const retryAfter = upstream.headers.get("retry-after");
        if (retryAfter) headers["retry-after"] = retryAfter;
        return errorResponse(
            429,
            "upstream_rate_limited",
            "The base Pollinations model is rate limited.",
            "Honor Retry-After if present, then retry.",
            headers,
        );
    }
    if (upstream.status >= 500) {
        return errorResponse(
            502,
            "upstream_error",
            "The base Pollinations model returned an upstream error.",
            "Retry later or choose a different base model.",
        );
    }
    return errorResponse(
        upstream.status,
        "upstream_request_failed",
        "The base Pollinations model rejected the request.",
        "Check the request body and base model access.",
    );
}

export async function handleOpenAIWrapperRequest(request, options = {}) {
    const url = new URL(request.url);
    if (!isOpenAIChatPath(url.pathname)) {
        if (request.method === "GET" && url.pathname === "/health") {
            return json({ status: "ok" });
        }
        return json({ error: "Not found" }, { status: 404 });
    }

    if (request.method !== "POST") {
        return json({ error: "Method not allowed" }, { status: 405 });
    }

    const authorization =
        request.headers.get("authorization") ??
        (options.apiKey ? `Bearer ${options.apiKey}` : null);
    if (!authorization) {
        return json(
            {
                error: {
                    message:
                        "Missing Authorization header or POLLINATIONS_API_KEY",
                    type: "invalid_request_error",
                },
            },
            { status: 401 },
        );
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return json({ error: "Invalid JSON" }, { status: 400 });
    }

    const upstreamBody = buildUpstreamChatBody(body, {
        baseModel: options.baseModel,
        systemPrompt: options.systemPrompt,
    });
    let upstream;
    try {
        upstream = await (options.fetch ?? fetch)(
            `${(options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "")}/v1/chat/completions`,
            {
                method: "POST",
                headers: {
                    authorization,
                    "content-type": "application/json",
                },
                body: JSON.stringify(upstreamBody),
            },
        );
    } catch {
        return errorResponse(
            502,
            "upstream_unavailable",
            "The base Pollinations model could not be reached.",
            "Retry later or choose a different base model.",
        );
    }

    if (!upstream.ok) {
        return upstreamErrorResponse(upstream);
    }

    if (
        body.stream ||
        !upstream.headers.get("content-type")?.includes("json")
    ) {
        return upstream;
    }

    const responseBody = await upstream.json();
    if (upstream.ok && responseBody && typeof responseBody === "object") {
        responseBody.model = body.model ?? "minimal-openai-wrapper";
    }
    return json(responseBody, { status: upstream.status });
}
