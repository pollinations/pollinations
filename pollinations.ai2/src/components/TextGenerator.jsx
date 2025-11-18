import ReactMarkdown from "react-markdown";
import { CONTEXT } from "../config/content";
import { usePollinationsText } from "../hooks/usePollinationsText";

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
    prompt,
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

    // Support both 'prompt' (direct) and 'text' (with transforms) props
    const finalPrompt =
        prompt ||
        buildPrompt(text, transforms, {
            userLanguage,
            isMobile,
            ...props,
        });

    // Use the new hook
    const { text: generatedText, loading } = usePollinationsText(
        finalPrompt,
        seed
    );

    if (loading || !generatedText) {
        return <Component {...props}>...</Component>;
    }

    return (
        <Component {...props}>
            <ReactMarkdown>{generatedText}</ReactMarkdown>
        </Component>
    );
}
