import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { CONTEXT } from "../config/content";

// Pollinations API key (secret key for local dev)
const API_KEY = import.meta.env.VITE_POLLINATIONS_API_KEY;

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

// Custom hook for text generation using new enter.pollinations.ai API
function usePollinationsText(prompt, seed) {
    const [text, setText] = useState("");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;

        async function generateText() {
            try {
                // Use POST to /v1/chat/completions
                const response = await fetch(
                    "https://enter.pollinations.ai/api/generate/v1/chat/completions",
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${API_KEY}`,
                        },
                        body: JSON.stringify({
                            messages: [{ role: "user", content: prompt }],
                            model: "openai",
                            seed: seed,
                        }),
                    }
                );

                const data = await response.json();
                const generatedText = data.choices?.[0]?.message?.content || "";

                if (!cancelled) {
                    setText(generatedText);
                    setLoading(false);
                }
            } catch (error) {
                console.error("Text generation error:", error);
                if (!cancelled) {
                    setText("Failed to generate text");
                    setLoading(false);
                }
            }
        }

        generateText();

        return () => {
            cancelled = true;
        };
    }, [prompt, seed]);

    return loading ? null : text;
}

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

    // Use the new enter.pollinations.ai API
    const generatedText = usePollinationsText(finalPrompt, seed);

    if (!generatedText) {
        return <Component {...props}>...</Component>;
    }

    return (
        <Component {...props}>
            <ReactMarkdown>{generatedText}</ReactMarkdown>
        </Component>
    );
}
