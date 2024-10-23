import { useState, useCallback } from 'react';

/**
 * Custom hook to generate a Pollinations chat response based on the given messages and fetch the response.
 * 
 * @param {Array} initMessages - The initial array of message objects to send.
 * @param {number} [seed=-1] - The seed for random text generation.
 * @param {boolean} [jsonMode=false] - Whether to parse the response as JSON.
 * @returns {Array} - The array of messages with the assistant's response added.
 */
const usePollinationsChat = (initMessages = [], options = {}) => {
    const { seed = 42, jsonMode = false, model = "openai" } = options;

    const [messages, setMessages] = useState(initMessages);

    const sendUserMessage = useCallback((userMessage) => {
        const updatedMessages = [...messages, { role: "user", content: userMessage }];
        setMessages(updatedMessages);

        const requestBody = {
            messages: updatedMessages,
            jsonMode: jsonMode,
            seed: seed,
            model: model
        };

        fetch(`https://text.pollinations.ai/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        })
            .then((response) => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.text();
            })
            .then((data) => {
                let assistantMessage;
                try {
                    assistantMessage = jsonMode ? JSON.parse(data) : data;
                } catch (error) {
                    console.error("Error parsing response:", error);
                    assistantMessage = `Sorry, I encountered an error while processing the response: ${error.message}`;
                }
                setMessages(prevMessages => [...prevMessages, { role: "assistant", content: assistantMessage }]);
            })
            .catch((error) => {
                console.error("Error fetching chat:", error);
                const errorMessage = `I'm sorry, but I encountered an error while trying to respond: ${error.message}. Please try again later.`;
                setMessages(prevMessages => [...prevMessages, { role: "assistant", content: errorMessage }]);
            });
    }, [messages, jsonMode, seed, model]);

    return { sendUserMessage, messages };
};

export default usePollinationsChat;
