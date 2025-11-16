import { usePollinationsText } from "@pollinations/react";
import ReactMarkdown from "react-markdown";
import { CONTEXT } from "../config/content";

// Build the prompt with context + instructions + text
const buildPrompt = (text, transforms, props) => {
    const instructions = transforms
        .map((t) => t(props))
        .filter(Boolean)
        .map((s) => `- ${s}`)
        .join("\n");

    return `# Context
${CONTEXT}

# Instructions
${instructions}

Only output the final text, nothing else. Links should be in markdown format.

# Input Text
${text}`;
};

// Main text generation component
export function TextGenerator({
    text,
    transforms = [],
    seed,
    as: Component = "span",
    ...props
}) {
    const userLanguage =
        typeof navigator !== "undefined" ? navigator.language || "en" : "en";

    const isMobile =
        typeof window !== "undefined" ? window.innerWidth < 768 : false;

    const prompt = buildPrompt(text, transforms, {
        userLanguage,
        isMobile,
        ...props,
    });

    // Use the Pollinations text hook with seed for caching
    const generatedText = usePollinationsText(
        prompt,
        seed ? { seed } : undefined
    );

    if (!generatedText) {
        return <Component>...</Component>;
    }

    return (
        <Component>
            <ReactMarkdown>{generatedText}</ReactMarkdown>
        </Component>
    );
}
