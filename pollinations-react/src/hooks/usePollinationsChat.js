import { useState, useCallback, useRef, useEffect } from "react";

/**
 * Custom hook for multi-turn chat with the Pollinations API.
 *
 * @param {Array} initMessages - The initial array of message objects.
 * @param {Object} options - Configuration options
 * @param {number} [options.seed=42] - The seed for random text generation.
 * @param {boolean} [options.jsonMode=false] - Whether to parse the response as JSON.
 * @param {string} [options.model="openai"] - The model to use for chat.
 * @param {string} [options.apiKey] - Optional API key for authentication.
 * @returns {Object} - { sendMessage, messages, isLoading, error, reset }
 */
const usePollinationsChat = (initMessages = [], options = {}) => {
    const { seed = 42, jsonMode = false, model = "openai", apiKey } = options;

    const [messages, setMessages] = useState(initMessages);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const initialMessagesRef = useRef(initMessages);
    const abortControllerRef = useRef(null);

    const sendMessage = useCallback(
        async (userMessage) => {
            if (!userMessage || userMessage.trim() === "") return;

            if (typeof seed !== "number" || seed < 0 || seed > 4294967295) {
                setError("Seed must be a 32-bit unsigned integer (0-4294967295)");
                return;
            }

            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
            abortControllerRef.current = new AbortController();

            const updatedMessages = [
                ...messages,
                { role: "user", content: userMessage },
            ];
            setMessages(updatedMessages);
            setIsLoading(true);
            setError(null);

            try {
                const headers = { "Content-Type": "application/json" };
                
                if (!apiKey) {
                    throw new Error("API key is required");
                }

                if (!/^(pk_|sk_)/.test(apiKey)) {
                    console.warn("API key format may be invalid");
                }

                headers["Authorization"] = `Bearer ${apiKey}`;

                const response = await fetch(`https://gen.pollinations.ai/v1/chat/completions`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify({
                        messages: updatedMessages,
                        jsonMode,
                        seed,
                        model,
                    }),
                    signal: abortControllerRef.current.signal,
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.text();
                let assistantMessage = data;
                if (jsonMode) {
                    try {
                        assistantMessage = JSON.parse(data);
                    } catch (parseErr) {
                        throw new Error(`Failed to parse JSON response: ${parseErr.message}`);
                    }
                }

                setMessages((prevMessages) => [
                    ...prevMessages,
                    { role: "assistant", content: assistantMessage },
                ]);
            } catch (err) {
                if (err.name === "AbortError") return;
                console.error("Error fetching chat:", err);
                setError(err.message);
            } finally {
                setIsLoading(false);
            }
        },
        [messages, jsonMode, seed, model, apiKey],
    );

    useEffect(() => {
        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, []);

    const reset = useCallback(() => {
        setMessages(initialMessagesRef.current);
        setError(null);
    }, []);

    // Backwards compatibility alias
    const sendUserMessage = sendMessage;

    return { sendMessage, sendUserMessage, messages, isLoading, error, reset };
};

export default usePollinationsChat;
