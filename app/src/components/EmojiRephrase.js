import React from "react";
import useRandomSeed from "../hooks/useRandomSeed";
import ReactMarkdown from "react-markdown";
import { Typography } from "@material-ui/core";
import StyledLink from "./StyledLink"; // Import StyledLink
import useResponsivePollinationsText from "../hooks/useResponsivePollinationsText";
import PromptTooltip from "./PromptTooltip"; // Ensure correct import

export function EmojiRephrase({ children }) {
    const seed = useRandomSeed();
    const prompt = `Format and add emojis. Text: '${children}'. Only respond with the markdown. No explanation. No code box. try not to change the length much.`;
    const rephrase = useResponsivePollinationsText(prompt, { seed });

    return (
        <PromptTooltip title={prompt} seed={seed}>
            <ReactMarkdown
                components={{
                    p: ({ node, ...props }) => <Typography component="span" style={{ fontSize: "1.2em" }} {...props} />,
                    a: ({ node, ...props }) => <StyledLink {...props} /> // Use StyledLink for links
                }}>
                {rephrase}
            </ReactMarkdown>
        </PromptTooltip>
    );
}