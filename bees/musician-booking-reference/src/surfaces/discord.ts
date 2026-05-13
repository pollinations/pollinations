import type { MusicianBookingAgent } from "../agent.js";
import type { AgentReply } from "../types.js";

export type DiscordMessageInput = {
    authorId: string;
    channelId: string;
    guildId?: string;
    content: string;
    stateScope?: "user" | "channel";
    now?: Date;
};

export type DiscordReply = {
    type: 4;
    data: {
        content: string;
        allowed_mentions: { parse: [] };
    };
    metadata: {
        conversation_id: string;
        booking_id: string;
        status: AgentReply["status"];
        tool_calls: string[];
    };
};

function discordStateKey(input: DiscordMessageInput): string {
    if (input.stateScope === "user") return `discord:user:${input.authorId}`;
    const guildPart = input.guildId ?? "dm";
    return `discord:channel:${guildPart}:${input.channelId}`;
}

export async function handleDiscordMessage(
    agent: MusicianBookingAgent,
    input: DiscordMessageInput,
): Promise<DiscordReply> {
    const reply = await agent.handleInboundMessage({
        userId: discordStateKey(input),
        channel: "discord",
        text: input.content,
        now: input.now,
    });

    return {
        type: 4,
        data: {
            content: reply.text,
            allowed_mentions: { parse: [] },
        },
        metadata: {
            conversation_id: reply.conversationId,
            booking_id: reply.bookingId,
            status: reply.status,
            tool_calls: reply.toolCalls,
        },
    };
}
