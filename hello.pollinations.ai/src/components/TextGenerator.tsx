import ReactMarkdown from "react-markdown";
import {
    CONTEXT as GLOBAL_CONTEXT,
    STYLES,
    DEFAULT_MODEL,
} from "../config/content/globals";
import { usePollinationsText } from "../hooks/usePollinationsText";

// Build the prompt with context + instructions + text
const buildPrompt = (text: string, transforms: any[], props: any) => {
    const instructions = transforms
        .map((t) => t(props))
        .filter(Boolean)
        .map((s) => `- ${s}`)
        .join("\n");

    return `# Context
${GLOBAL_CONTEXT}

# Instructions
${instructions}

Only output the final text, nothing else. Links should be in markdown format.

# Input Text
${text}`;
};

import { ElementType, ComponentPropsWithoutRef } from "react";

interface ContentObject {
    text: string;
    seed?: number | number[];
    style?: string;
    transforms?: any[];
    maxWords?: number;
    model?: string;
}

interface TextGeneratorProps<T extends ElementType> {
    content?: ContentObject;
    prompt?: string;
    text?: string;
    transforms?: any[];
    seed?: number | number[];
    as?: T;
}

// Main text generation component
export function TextGenerator<T extends ElementType = "span">({
    content,
    // Legacy props
    prompt,
    text,
    transforms = [],
    seed,
    as,
    ...props
}: TextGeneratorProps<T> & Omit<ComponentPropsWithoutRef<T>, keyof TextGeneratorProps<T>>) {
    const Component = as || "span";
    const userLanguage =
        typeof navigator !== "undefined" ? navigator.language || "en" : "en";

    const isMobile =
        typeof window !== "undefined" ? window.innerWidth < 768 : false;

    // Prepare generation parameters
    let finalPrompt = null;
    let finalSeed = seed;
    let finalModel = DEFAULT_MODEL;
    let isExact = false;
    let exactText = "";

    // NEW: Unified content object
    if (content) {
        const {
            text: contentText,
            seed: contentSeed = 0,
            style,
            transforms: contentTransforms = [],
            maxWords,
            model = DEFAULT_MODEL,
        } = content;

        // NEW LOGIC: No style + no transforms = exact text (no AI generation)
        const hasStyle = !!style;
        const hasTransforms = contentTransforms.length > 0;
        const shouldGenerate = hasStyle || hasTransforms;

        if (!shouldGenerate) {
            // Use text as-is (exact)
            isExact = true;
            exactText = contentText;
        } else {
            // Build transform list
            const allTransforms = [...contentTransforms];

            // Add style transform if style is present
            if (hasStyle) {
                allTransforms.unshift(() => (STYLES as any)[style] || null);
            }

            // Add brevity if maxWords is set
            if (maxWords) {
                allTransforms.push(
                    () =>
                        `Keep under ${maxWords} words. Be concise and impactful.`
                );
            }

            // Handle multiple seeds (variations) - pick random seed on load
            finalSeed = Array.isArray(contentSeed)
                ? contentSeed[Math.floor(Math.random() * contentSeed.length)]
                : contentSeed;

            // Generate prompt
            finalPrompt = buildPrompt(contentText, allTransforms, {
                style,
                maxWords,
                userLanguage,
                isMobile,
                ...props,
            });

            finalModel = model;
        }
    } else {
        // Legacy support (existing code continues to work)
        finalPrompt =
            prompt ||
            buildPrompt(text || "", transforms, {
                userLanguage,
                isMobile,
                ...props,
            });
    }

    // Call hook unconditionally (React rules)
    const { text: generatedText, loading } = usePollinationsText(
        finalPrompt,
        finalSeed,
        { model: finalModel }
    );

    // Handle exact text case
    if (isExact) {
        return (
            <Component {...props}>
                <ReactMarkdown
                    components={{
                        p: ({ children }) => <>{children}</>,
                    }}
                >
                    {exactText}
                </ReactMarkdown>
            </Component>
        );
    }

    // Handle loading and generated text
    if (loading || !generatedText) {
        return <Component {...props}>...</Component>;
    }

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
