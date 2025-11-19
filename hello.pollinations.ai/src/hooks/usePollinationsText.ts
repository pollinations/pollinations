import { useState, useEffect } from "react";
import { API, DEFAULTS, API_KEY } from "../config/api";

interface PollinationsTextOptions {
    model?: string;
}

interface UsePollinationsTextReturn {
    text: string;
    loading: boolean;
    error: any;
}

export function usePollinationsText(
    prompt: string | null,
    seed?: number | number[],
    options: PollinationsTextOptions = {}
): UsePollinationsTextReturn {
    const [text, setText] = useState<string>("");
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<any>(null);

    useEffect(() => {
        if (!prompt) {
            setLoading(false);
            return;
        }

        const controller = new AbortController();
        const signal = controller.signal;

        setLoading(true);
        setError(null);

        async function generateText() {
            try {
                const response = await fetch(API.TEXT_GENERATION, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${API_KEY}`,
                    },
                    body: JSON.stringify({
                        messages: [{ role: "user", content: prompt }],
                        model: options.model || DEFAULTS.TEXT_MODEL,
                        seed: seed,
                    }),
                    signal,
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json();
                const generatedText = data.choices?.[0]?.message?.content || "";

                if (!signal.aborted) {
                    setText(generatedText);
                    setLoading(false);
                }
            } catch (err: any) {
                if (err.name === "AbortError") {
                    // Request was aborted, do nothing
                    return;
                }
                console.error("Text generation error:", err);
                if (!signal.aborted) {
                    setError(err);
                    setText("Failed to generate text");
                    setLoading(false);
                }
            }
        }

        generateText();

        return () => {
            controller.abort();
        };
    }, [prompt, seed, options.model]);

    return { text, loading, error };
}
