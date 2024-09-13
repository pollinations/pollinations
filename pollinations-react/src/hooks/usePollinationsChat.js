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
    const { seed = 42, jsonMode = false } = options;

    const [messages, setMessages] = useState(initMessages);

    const sendUserMessage = useCallback((userMessage) => {
        const updatedMessages = [...messages, { role: "user", content: userMessage }];
        setMessages(updatedMessages);

        const requestBody = {
            messages: updatedMessages,
            jsonMode: jsonMode,
            seed: seed
        };


        fetch(`https://text.pollinations.ai/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
        })
            .then((response) => response.text())
            .then((data) => {
                const assistantMessage = jsonMode ? JSON.parse(data) : data;
                setMessages([...updatedMessages, { role: "assistant", content: assistantMessage }]);
            })
            .catch((error) => {
                console.error("Error fetching chat:", error);
                throw error;
            });
    }, [messages, jsonMode, seed]);

    return { sendUserMessage, messages };
};

export default usePollinationsChat;