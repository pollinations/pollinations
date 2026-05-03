import type { MusicianBookingAgent } from "../agent.js";
import type { AgentReply } from "../types.js";

type OpenAIContentPart = {
    type: "text" | "input_text";
    text: string;
};

type OpenAIChatMessage = {
    role: "system" | "user" | "assistant" | "tool";
    content: string | OpenAIContentPart[];
};

export type OpenAIChatCompletionRequest = {
    model?: string;
    user?: string;
    messages: OpenAIChatMessage[];
};

export type OpenAIChatCompletionResponse = {
    id: string;
    object: "chat.completion";
    created: number;
    model: string;
    choices: Array<{
        index: number;
        message: { role: "assistant"; content: string };
        finish_reason: "stop";
    }>;
    metadata: {
        conversation_id: string;
        booking_id: string;
        status: AgentReply["status"];
        quote_total?: number;
        tool_calls: string[];
        needs_review: boolean;
    };
};

function contentToText(content: OpenAIChatMessage["content"]): string {
    if (typeof content === "string") return content;
    return content.map((part) => part.text).join("\n").trim();
}

function lastUserText(messages: OpenAIChatMessage[]): string {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index];
        if (message?.role === "user") return contentToText(message.content);
    }
    return "";
}

export async function handleOpenAIChatCompletion(
    agent: MusicianBookingAgent,
    request: OpenAIChatCompletionRequest,
    options: { now?: Date; fallbackUserId?: string } = {},
): Promise<OpenAIChatCompletionResponse> {
    const reply = await agent.handleInboundMessage({
        userId: request.user ?? options.fallbackUserId ?? "anonymous",
        channel: "api",
        text: lastUserText(request.messages),
        now: options.now,
    });

    return {
        id: `chatcmpl_${reply.conversationId}`,
        object: "chat.completion",
        created: Math.floor((options.now ?? new Date()).getTime() / 1000),
        model: request.model ?? "musician-booking-reference",
        choices: [
            {
                index: 0,
                message: { role: "assistant", content: reply.text },
                finish_reason: "stop",
            },
        ],
        metadata: {
            conversation_id: reply.conversationId,
            booking_id: reply.bookingId,
            status: reply.status,
            quote_total: reply.quoteTotal,
            tool_calls: reply.toolCalls,
            needs_review: reply.needsReview,
        },
    };
}
