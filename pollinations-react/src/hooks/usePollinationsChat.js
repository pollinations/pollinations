import { useState, useCallback, useRef } from "react";

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

    const sendMessage = useCallback(
        async (userMessage) => {
            const updatedMessages = [
                ...messages,
                { role: "user", content: userMessage },
            ];
            setMessages(updatedMessages);
            setIsLoading(true);
            setError(null);

            try {
                const headers = { "Content-Type": "application/json" };
                if (apiKey) {
                    headers["Authorization"] = `Bearer ${apiKey}`;
                }

                const response = await fetch(`https://text.pollinations.ai/`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify({
                        messages: updatedMessages,
                        jsonMode,
                        seed,
                        model,
                    }),
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.text();
                const assistantMessage = jsonMode ? JSON.parse(data) : data;

                setMessages((prevMessages) => [
                    ...prevMessages,
                    { role: "assistant", content: assistantMessage },
                ]);
            } catch (err) {
                console.error("Error fetching chat:", err);
                setError(err.message);
            } finally {
                setIsLoading(false);
            }
        },
        [messages, jsonMode, seed, model, apiKey],
    );

    const reset = useCallback(() => {
        setMessages(initialMessagesRef.current);
        setError(null);
    }, []);

    // Backwards compatibility alias
    const sendUserMessage = sendMessage;

    return { sendMessage, sendUserMessage, messages, isLoading, error, reset };
};

export default usePollinationsChat;
