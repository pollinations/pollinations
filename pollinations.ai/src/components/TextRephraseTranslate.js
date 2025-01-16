import React from "react";
import useRandomSeed from "../hooks/useRandomSeed";
import ReactMarkdown from "react-markdown";
import useResponsivePollinationsText from "../hooks/useResponsivePollinationsText";
import PromptTooltip from "./PromptTooltip";

export function TextRephraseTranslate({ children }) {
    //console.log("EmojiRephrase: Received children:", children);
    const seed = useRandomSeed();
    //console.log("EmojiRephrase: Obtained seed:", seed);
    const prompt = `Text: '${children}'. Only respond with the markdown. No explanation. No code box. try not to change the length much.`;
    //console.log("EmojiRephrase: Constructed prompt:", prompt);
    const rephrase = useResponsivePollinationsText(prompt, { seed });

    return (
        <PromptTooltip title={prompt} seed={seed}>
            <ReactMarkdown>
                {rephrase}  
            </ReactMarkdown>
        </PromptTooltip>
    );
}