import React from "react";
import useRandomSeed from "../hooks/useRandomSeed";
import ReactMarkdown from "react-markdown";
import useResponsivePollinationsText from "../hooks/useResponsivePollinationsText";
import PromptTooltip from "./PromptTooltip";

export function EmojiRephrase({ children }) {
    const seed = useRandomSeed();
    const prompt = `Format and add emojis. Text: '${children}'. Only respond with the markdown. No explanation. No code box. try not to change the length much.`;
    const rephrase = useResponsivePollinationsText(prompt, { seed });

    return (
        <PromptTooltip title={prompt} seed={seed}>
                <ReactMarkdown>
                    {rephrase}  
                </ReactMarkdown>
        </PromptTooltip>
    );
}