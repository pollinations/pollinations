/**
 * Authentication redirect utilities for Pollinations text service
 * Handles redirecting authenticated users to enter.pollinations.ai
 */

import crypto from "crypto";

// Generate a unique ID with pllns_ prefix
function generatePollinationsId() {
    const hash = crypto.randomBytes(16).toString("hex");
    return `pllns_${hash}`;
}

const REDIRECT_MESSAGE = `⚠️ **IMPORTANT NOTICE** ⚠️

The Pollinations legacy text API is being deprecated for **authenticated users**.

Please migrate to our new service at https://enter.pollinations.ai for better performance and access to all the latest models.

Note: Anonymous requests to text.pollinations.ai are NOT affected and will continue to work normally.`;

/**
 * Send redirect conversation response for authenticated users
 * Returns a mock conversation response redirecting users to enter.pollinations.ai
 * Handles both streaming and non-streaming responses, adapts to endpoint type
 * 
 * @param {Object} res - Express response object
 * @param {Object} req - Express request object
 * @param {Object} requestData - Request data including model and stream flag
 * @param {Function} sendContentResponse - Helper for plain text responses
 * @param {Function} sendOpenAIResponse - Helper for OpenAI JSON responses
 */
export async function sendRedirectConversationResponse(res, req, requestData, sendContentResponse, sendOpenAIResponse) {
    const model = requestData.model || "openai-fast";
    
    const mockCompletion = {
        id: generatePollinationsId(),
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [{
            index: 0,
            message: { role: "assistant", content: REDIRECT_MESSAGE },
            finish_reason: "stop"
        }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    };

    if (requestData.stream) {
        // Handle SSE Streaming redirect
        res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.flushHeaders();
        
        const chunk = {
            id: mockCompletion.id,
            object: "chat.completion.chunk",
            created: mockCompletion.created,
            model,
            choices: [{ index: 0, delta: { role: "assistant", content: REDIRECT_MESSAGE }, finish_reason: null }]
        };
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        
        const stopChunk = { ...chunk, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] };
        res.write(`data: ${JSON.stringify(stopChunk)}\n\n`);
        res.write("data: [DONE]\n\n");
        return res.end();
    }

    // Handle non-streaming responses based on endpoint type
    if (req.method === "GET" || req.path === "/") {
        return sendContentResponse(res, mockCompletion);
    } else {
        return sendOpenAIResponse(res, mockCompletion);
    }
}

export { REDIRECT_MESSAGE };
