import { useState, useCallback, useEffect } from "react";
import { usePollinationsText } from "./usePollinationsText";
import { SYSTEM_PROMPT } from "../config/prompts/systemPrompt";
import { TokenId } from "../config/designTokens";

// ThemeDefinition is now Hex -> IDs
export type ThemeDefinition = Record<string, TokenId[]>;

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

    // Log the prompt being sent
    useEffect(() => {
        if (fullPrompt) {
            console.log("🚀 LLM REQUEST (Full Prompt):");
            console.log(fullPrompt);
        }
    }, [fullPrompt]);

    // Use the existing text generation hook
    const {
        text: generatedText,
        loading,
        error: apiError,
    } = usePollinationsText(
        fullPrompt,
        42, // Fixed seed for consistency (can be randomized if needed)
        { model: "openai-large" },
    );

    // Check for API errors first
    useEffect(() => {
        if (apiError && userPrompt) {
            const errorMessage = apiError.message || String(apiError);
            setError(errorMessage);
            setTheme(null);
        }
    }, [apiError, userPrompt]);

    // Parse the response when it arrives
    useEffect(() => {
        if (!loading && generatedText && userPrompt && !apiError) {
            // Log the raw response
            console.log("📥 LLM RESPONSE (Raw):");
            console.log(generatedText);

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

                // Convert new format (with slots) to dictionary format
                let convertedTheme: ThemeDefinition = {};

                if (parsed.slots) {
                    // New format: { slots: { slot_0: { hex, ids }, ... } }
                    Object.values(parsed.slots).forEach((slot: any) => {
                        const hex = slot.hex;
                        const ids = slot.ids || slot.paths; // Handle both just in case LLM hallucinates paths
                        if (!convertedTheme[hex]) {
                            convertedTheme[hex] = [];
                        }
                        convertedTheme[hex].push(...ids);
                    });
                } else {
                    // Fallback or old format? Should not happen with new prompt
                    // But if it does, try to parse it
                    convertedTheme = parsed as ThemeDefinition;
                }

                setTheme(convertedTheme);
                setError(null);
            } catch (err) {
                console.error("Failed to parse theme JSON:", err);
                setError(
                    "Failed to parse theme. AI response was not valid JSON.",
                );
                setTheme(null);
            }
        }
    }, [loading, generatedText, userPrompt, apiError]);

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
