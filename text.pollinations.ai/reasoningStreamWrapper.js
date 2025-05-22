import { Transform } from 'stream';
import debug from 'debug';

const log = debug('pollinations:reasoning');
const errorLog = debug('pollinations:reasoning:error');

/**
 * Creates a streaming wrapper that properly handles reasoning content and wraps it with <think> tags
 * This maintains consistent formatting between streaming and non-streaming responses
 * @param {Stream} responseStream - The original response stream from the API
 * @param {Object} options - Options for the wrapper (model name, etc.)
 * @returns {Stream} - A transformed stream with proper think tags
 */
export function createReasoningStreamWrapper(responseStream, options = {}) {
    if (!responseStream || !responseStream.pipe) {
        log('Invalid stream provided to createReasoningStreamWrapper');
        return responseStream;
    }

    log(`Creating reasoning stream wrapper for model: ${options.model || 'unknown'}`);

    // Track reasoning content and regular content separately
    let reasoningContent = '';
    let isCollectingReasoning = false;
    let lastReasoningChunk = null;
    let currentChunkIsReasoning = false;
    let hasSentReasoning = false;
    let isDone = false;

    // Create a transform stream that will:
    // 1. Buffer reasoning_content
    // 2. Add <think> tags around reasoning content
    // 3. Properly format the stream output
    const streamTransformer = new Transform({
        objectMode: true,
        transform(chunk, _encoding, callback) {
            const chunkStr = chunk.toString();

            // Check if this is the [DONE] message
            if (chunkStr.includes('data: [DONE]')) {
                isDone = true;
                
                // If we haven't yet sent any reasoning content but have collected some,
                // send it wrapped in think tags before the [DONE] message
                if (reasoningContent && !hasSentReasoning) {
                    const thinkChunk = formatThinkTagsAsSSE(`<think>${reasoningContent}</think>`);
                    this.push(thinkChunk);
                    hasSentReasoning = true;
                }
                
                // Push the [DONE] message
                this.push(chunk);
                callback();
                return;
            }

            try {
                // Parse the JSON content from the chunk
                const matches = chunkStr.match(/data: (.*?)(?:\n\n|$)/g);
                
                if (matches && matches.length > 0) {
                    for (const match of matches) {
                        const dataContent = match.replace(/^data: /, '').trim();
                        
                        if (dataContent && dataContent !== '[DONE]') {
                            try {
                                const data = JSON.parse(dataContent);
                                
                                // Handle different response formats
                                if (data.choices && data.choices.length > 0) {
                                    const choice = data.choices[0];
                                    
                                    if (choice.delta) {
                                        // Delta contains reasoning_content
                                        if (choice.delta.reasoning_content !== undefined) {
                                            currentChunkIsReasoning = true;
                                            isCollectingReasoning = true;
                                            
                                            // Collect the reasoning content
                                            if (choice.delta.reasoning_content !== null) {
                                                reasoningContent += choice.delta.reasoning_content;
                                                lastReasoningChunk = chunk;
                                            } else {
                                                // End of reasoning content
                                                isCollectingReasoning = false;
                                            }
                                            
                                            // Don't pass reasoning chunks through directly
                                            callback();
                                            return;
                                        }
                                        
                                        // Delta contains regular content
                                        if (choice.delta.content !== undefined) {
                                            // If we're transitioning from reasoning to content
                                            if (isCollectingReasoning && !currentChunkIsReasoning) {
                                                isCollectingReasoning = false;
                                            }
                                            
                                            // If we have collected reasoning content but haven't sent it yet
                                            if (reasoningContent && !hasSentReasoning && !isCollectingReasoning) {
                                                const thinkChunk = formatThinkTagsAsSSE(`<think>${reasoningContent}</think>`);
                                                this.push(thinkChunk);
                                                hasSentReasoning = true;
                                            }
                                            
                                            // Reset the current chunk type
                                            currentChunkIsReasoning = false;
                                        }
                                    }
                                }
                            } catch (e) {
                                errorLog(`Error parsing JSON in reasoning stream: ${e.message}`);
                            }
                        }
                    }
                }
                
                // If this is not a reasoning content chunk, pass it through unchanged
                if (!currentChunkIsReasoning) {
                    this.push(chunk);
                }
                
                callback();
            } catch (error) {
                errorLog(`Error in reasoning stream transform: ${error.message}`);
                this.push(chunk);  // Pass through in case of error
                callback();
            }
        }
    });

    // Pipe the original stream through our transformer
    return responseStream.pipe(streamTransformer);
}

/**
 * Format content as an SSE chunk with proper structure
 * @param {string} content - The content to format
 * @returns {string} - Formatted SSE chunk
 */
function formatThinkTagsAsSSE(content) {
    try {
        log(`Formatting think tags as SSE: ${content.substring(0, 50)}${content.length > 50 ? '...' : ''}`);

        // Create a delta object similar to what the API would return
        const deltaObject = {
            id: `think_${Date.now()}`,
            object: 'chat.completion.chunk',
            created: Math.floor(Date.now() / 1000),
            model: 'thinking-stream',
            choices: [
                {
                    index: 0,
                    delta: {
                        content: content
                    },
                    finish_reason: null
                }
            ]
        };

        // Format as SSE
        return `data: ${JSON.stringify(deltaObject)}\n\n`;
    } catch (error) {
        errorLog(`Error formatting think tags as SSE: ${error.message}`);
        return '';
    }
}
