import type { MusicianBookingAgent } from "../../agent.js";
import { createMusicianBookingAgent } from "../../agent.js";

export type AgentCoreInvocation = {
    prompt?: string;
    session_id?: string;
    user_id?: string;
    stream?: boolean;
};

export type AgentCoreResponse = {
    response: string;
    status: "success";
    session_id: string;
    metadata: {
        booking_id: string;
        booking_status: string;
        quote_total?: number;
        tool_calls: string[];
        needs_review: boolean;
    };
};

const defaultAgent = createMusicianBookingAgent();

function json(data: unknown, init: ResponseInit = {}): Response {
    const headers = new Headers(init.headers);
    headers.set("content-type", "application/json; charset=utf-8");
    return new Response(JSON.stringify(data), { ...init, headers });
}

async function readInvocation(request: Request): Promise<AgentCoreInvocation> {
    try {
        return (await request.json()) as AgentCoreInvocation;
    } catch {
        return {};
    }
}

export async function handleAgentCoreRequest(
    request: Request,
    options: {
        agent?: MusicianBookingAgent;
        now?: Date;
    } = {},
): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/ping") {
        return json({
            status: "Healthy",
            time_of_last_update: Math.floor(Date.now() / 1000),
        });
    }

    if (request.method !== "POST" || url.pathname !== "/invocations") {
        return json({ error: "Not found" }, { status: 404 });
    }

    const agent = options.agent ?? defaultAgent;
    const body = await readInvocation(request);
    const reply = await agent.handleInboundMessage({
        userId: body.user_id ?? body.session_id ?? "agentcore-anonymous",
        channel: "api",
        text: body.prompt ?? "",
        now: options.now,
    });
    const response: AgentCoreResponse = {
        response: reply.text,
        status: "success",
        session_id: body.session_id ?? reply.conversationId,
        metadata: {
            booking_id: reply.bookingId,
            booking_status: reply.status,
            quote_total: reply.quoteTotal,
            tool_calls: reply.toolCalls,
            needs_review: reply.needsReview,
        },
    };

    if (body.stream) {
        return new Response(`data: ${JSON.stringify(response)}\n\n`, {
            headers: { "content-type": "text/event-stream" },
        });
    }

    return json(response);
}
