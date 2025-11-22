/**
 * GEN COPY Pipeline Component
 * Generates website text/copy using the prompt assembler
 */

import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { ElementType, ComponentPropsWithoutRef } from "react";
import { generateText } from "../../services/pollinationsAPI";
import { assembleCopyPrompt } from "../../content/buildPrompts";

interface ContentObject {
    text: string;
    transforms?: Array<() => string | null>; // Optional transforms
}

interface TextGeneratorProps<T extends ElementType> {
    content?: ContentObject | string;
    as?: T;
}

export function TextGenerator<T extends ElementType = "span">({
    content,
    as,
    ...props
}: TextGeneratorProps<T> &
    Omit<ComponentPropsWithoutRef<T>, keyof TextGeneratorProps<T>>) {
    const Component = as || "span";
    const [generatedText, setGeneratedText] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    // Get user context
    const userLanguage =
        typeof navigator !== "undefined" ? navigator.language || "en" : "en";
    const isMobile =
        typeof window !== "undefined" ? window.innerWidth < 768 : false;

    useEffect(() => {
        if (!content) return;

        // Extract text and transforms
        const websiteInfo =
            typeof content === "string" ? content : content.text;
        const transforms =
            typeof content === "object" ? content.transforms : undefined;

        // If no text, don't render
        if (!websiteInfo) return;

        // NO TRANSFORMS = EXACT TEXT (no LLM call)
        if (!transforms || transforms.length === 0) {
            setGeneratedText(websiteInfo);
            setLoading(false);
            return;
        }

        // HAS TRANSFORMS = Call LLM with GEN COPY pipeline
        const controller = new AbortController();
        setLoading(true);

        const prompt = assembleCopyPrompt(
            websiteInfo,
            isMobile ? "mobile" : "desktop",
            userLanguage
        );

        generateText(prompt, 42, "openai", controller.signal)
            .then((text) => {
                if (!controller.signal.aborted) {
                    setGeneratedText(text);
                }
            })
            .catch((err) => {
                if (err.name !== "AbortError") {
                    console.error("Text generation error:", err);
                }
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setLoading(false);
                }
            });

        return () => controller.abort();
    }, [content, isMobile, userLanguage]);

    // Loading state
    if (loading || !generatedText) {
        return <Component {...props}>...</Component>;
    }

    // Render generated text
    return (
        <Component {...props}>
            <ReactMarkdown
                components={{
                    p: ({ children }) => <>{children}</>,
                }}
            >
                {generatedText}
            </ReactMarkdown>
        </Component>
    );
}
