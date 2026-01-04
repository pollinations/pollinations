import { sendMessage } from "./src/utils/api.js";

// Test function calling
const testFunctionCalling = async () => {
    const messages = [
        {
            role: "user",
            content:
                "Create a bar chart showing sales data for January, February, and March with values 100, 150, 200",
        },
    ];

    console.log("Testing function calling...");

    await sendMessage(
        messages,
        (chunk, _fullContent, _error) => {
            console.log("Chunk received:", chunk);
        },
        (finalContent, error) => {
            console.log("Final content:", finalContent);
            console.log("Error:", error);
        },
        (error) => {
            console.error("Error:", error);
        },
        "openai-large",
        { maxTokens: 1000, temperature: 0.7 },
    );
};

testFunctionCalling();
