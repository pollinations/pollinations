// The scrolling conversation. Each message is colored by persona, prefixed with
// a speaker label, and (for assistant lines) markdown-rendered. An up/down arrow
// trails any line that moved a floor.

import { Box, Text } from "ink";
import { type Message, PERSONA_COLOR, PERSONA_LABEL } from "../types.js";
import { renderMarkdown } from "./markdown.js";

const ACTION_ARROW: Record<string, { symbol: string; color: string }> = {
    up: { symbol: "↑", color: "blue" },
    down: { symbol: "↓", color: "red" },
    join: { symbol: "✦", color: "magenta" },
};

function MessageRow({ msg }: { msg: Message }) {
    const color = PERSONA_COLOR[msg.persona];
    const label = PERSONA_LABEL[msg.persona];
    const arrow = ACTION_ARROW[msg.action];
    // The player types plainly; everyone else may use markdown/emoji.
    const body =
        msg.persona === "user" ? msg.message : renderMarkdown(msg.message);

    return (
        <Box flexDirection="column" marginBottom={1}>
            <Box>
                <Text bold color={color}>
                    {label}
                    {msg.persona === "user" ? " ›" : ":"}{" "}
                </Text>
                {arrow && <Text color={arrow.color}>{arrow.symbol} </Text>}
            </Box>
            <Box paddingLeft={2}>
                <Text color={msg.persona === "user" ? color : undefined}>
                    {body}
                </Text>
            </Box>
        </Box>
    );
}

export function Transcript({ messages }: { messages: Message[] }) {
    return (
        <Box flexDirection="column" marginTop={1}>
            {messages.map((msg, i) => (
                // Append-only log: index + a content slice is a stable key.
                <MessageRow
                    key={`${i}-${msg.persona}-${msg.message.slice(0, 12)}`}
                    msg={msg}
                />
            ))}
        </Box>
    );
}
