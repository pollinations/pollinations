import { useState, useCallback, useEffect } from "react";
import { usePollinationsText } from "./usePollinationsText";
import { SYSTEM_PROMPT } from "../config/content/colorSystem";

interface ThemeDefinition {
    [hexColor: string]: string[];
}

interface UseThemeGeneratorReturn {
    generateTheme: (userPrompt: string) => void;
    theme: ThemeDefinition | null;
    loading: boolean;
    error: string | null;
}

export function useThemeGenerator(): UseThemeGeneratorReturn {
    const [userPrompt, setUserPrompt] = useState<string | null>(null);
    const [theme, setTheme] = useState<ThemeDefinition | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Build the full prompt: system message + user request
    const fullPrompt = userPrompt
        ? `${SYSTEM_PROMPT}

USER REQUEST:
${userPrompt}

Generate the theme now as JSON:`
        : null;

    // Use the existing text generation hook
    const { text: generatedText, loading } = usePollinationsText(
        fullPrompt,
        42, // Fixed seed for consistency (can be randomized if needed)
        { model: "openai-large" },
    );

    // Parse the response when it arrives
    useEffect(() => {
        if (!loading && generatedText && userPrompt) {
            try {
                // Try to extract JSON from the response
                let jsonText = generatedText.trim();

                // Remove markdown code blocks if present
                jsonText = jsonText.replace(/^```json?\n?/i, "");
                jsonText = jsonText.replace(/\n?```$/, "");
                jsonText = jsonText.trim();

                const parsed = JSON.parse(jsonText);

                // Validate structure
                if (typeof parsed !== "object" || Array.isArray(parsed)) {
                    throw new Error("Invalid theme structure");
                }

                setTheme(parsed as ThemeDefinition);
                setError(null);
            } catch (err) {
                console.error("Failed to parse theme JSON:", err);
                setError(
                    "Failed to parse theme. AI response was not valid JSON.",
                );
                setTheme(null);
            }
        }
    }, [loading, generatedText, userPrompt]);

    const generateTheme = useCallback((prompt: string) => {
        setUserPrompt(prompt);
        setTheme(null);
        setError(null);
    }, []);

    return {
        generateTheme,
        theme,
        loading,
        error,
    };
}
