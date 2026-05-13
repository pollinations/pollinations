import type { MusicianBookingAgent } from "../agent.js";
import type { AgentReply } from "../types.js";

export type WebMessageInput = {
    userId: string;
    text: string;
    now?: Date;
};

export async function handleWebMessage(
    agent: MusicianBookingAgent,
    input: WebMessageInput,
): Promise<AgentReply> {
    return agent.handleInboundMessage({
        userId: input.userId,
        channel: "web",
        text: input.text,
        now: input.now,
    });
}

export function toServerSentEvents(reply: AgentReply): string {
    const events = [
        {
            event: "message",
            data: {
                text: reply.text,
                conversation_id: reply.conversationId,
                booking_id: reply.bookingId,
                status: reply.status,
            },
        },
        { event: "tool_calls", data: reply.toolCalls },
        { event: "done", data: { needs_review: reply.needsReview } },
    ];

    return events
        .map(
            ({ event, data }) =>
                `event: ${event}\ndata: ${JSON.stringify(data)}\n`,
        )
        .join("\n");
}
