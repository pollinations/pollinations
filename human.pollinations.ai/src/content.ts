import { escapeMarkdown } from "discord.js";
import type { ChatMessage } from "./types.js";

const URL = /https?:\/\/\S+/giu;
const DISCORD_MENTION = /<[@#][!&]?\d+>/gu;
const MAX_MESSAGE_LENGTH = 1_900;

export function hardenContent(content: string): string {
    return escapeMarkdown(
        content
            .replace(URL, "[link removed]")
            .replace(DISCORD_MENTION, "[mention]"),
    );
}

export function formatTranscript(messages: ChatMessage[]): string[] {
    const text = messages
        .map(
            (message) =>
                `${message.role.toUpperCase()}: ${hardenContent(message.content)}`,
        )
        .join("\n\n");
    const chunks: string[] = [];
    for (let offset = 0; offset < text.length; offset += MAX_MESSAGE_LENGTH) {
        chunks.push(text.slice(offset, offset + MAX_MESSAGE_LENGTH));
    }
    return chunks.length > 0 ? chunks : ["(empty conversation)"];
}
