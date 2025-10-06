/**
 * Streaming citation processor for handling citations in streaming responses
 * Processes citations from Vertex AI streaming responses and formats them for OpenAI compatibility
 */

import debug from 'debug';
const log = debug('text.pollinations.ai:streamingCitationProcessor');

/**
 * Processes streaming response chunks to extract and format citations
 * @param {Object} chunk - The streaming response chunk
 * @param {string} modelName - The model name
 * @param {Object} accumulatedCitations - Accumulated citations from previous chunks
 * @returns {Object} Object with processed chunk and updated citations
 */
export function processStreamingChunk(chunk, modelName, accumulatedCitations = { citations: [], annotations: [] }) {
    try {
        // Only process citations for gemini-search model
        if (!modelName || !modelName.includes('search')) {
            return { processedChunk: chunk, citations: accumulatedCitations };
        }

        // Check if chunk contains grounding metadata
        const groundingMetadata = chunk?.candidates?.[0]?.groundingMetadata;
        if (!groundingMetadata) {
            return { processedChunk: chunk, citations: accumulatedCitations };
        }

        // Extract citations from this chunk
        const newCitations = extractCitationsFromChunk(groundingMetadata);
        
        // Merge with accumulated citations
        const mergedCitations = mergeCitations(accumulatedCitations.citations, newCitations);
        
        // Update annotations if we have new grounding chunks
        const newAnnotations = extractAnnotationsFromChunk(groundingMetadata, mergedCitations);

        const updatedCitations = {
            citations: mergedCitations,
            annotations: [...accumulatedCitations.annotations, ...newAnnotations]
        };

        // Format the chunk for OpenAI compatibility
        const processedChunk = formatChunkForOpenAI(chunk, updatedCitations);

        log(`Processed streaming chunk with ${newCitations.length} new citations`);
        return { processedChunk, citations: updatedCitations };

    } catch (error) {
        log('Error processing streaming chunk:', error);
        return { processedChunk: chunk, citations: accumulatedCitations };
    }
}

/**
 * Extracts citations from a single chunk's grounding metadata
 * @param {Object} groundingMetadata - The grounding metadata from the chunk
 * @returns {Array} Array of citation objects
 */
function extractCitationsFromChunk(groundingMetadata) {
    const citations = [];
    const groundingChunks = groundingMetadata.groundingChunks || [];

    for (const chunk of groundingChunks) {
        if (chunk.web && chunk.web.uri) {
            const citation = {
                title: chunk.web.title || 'Untitled',
                url: chunk.web.uri,
                snippet: chunk.web.snippet || '',
                publisher: extractPublisherFromUrl(chunk.web.uri),
                published_date: chunk.web.publishedDate || null,
                confidence_score: chunk.confidenceScore || null
            };

            // Only add citation if it has essential information and isn't already present
            if (citation.url && citation.title !== 'Untitled') {
                citations.push(citation);
            }
        }
    }

    return citations;
}

/**
 * Extracts annotations from grounding metadata
 * @param {Object} groundingMetadata - The grounding metadata
 * @param {Array} citations - The current citations array
 * @returns {Array} Array of annotation objects
 */
function extractAnnotationsFromChunk(groundingMetadata, citations) {
    const annotations = [];
    const groundingChunks = groundingMetadata.groundingChunks || [];

    for (const chunk of groundingChunks) {
        if (chunk.web && chunk.web.uri && chunk.startIndex !== undefined && chunk.endIndex !== undefined) {
            const citation = citations.find(c => c.url === chunk.web.uri);
            
            if (citation) {
                const annotation = {
                    type: 'url_citation',
                    start_index: chunk.startIndex,
                    end_index: chunk.endIndex,
                    url: chunk.web.uri,
                    title: chunk.web.title || citation.title
                };
                
                annotations.push(annotation);
            }
        }
    }

    return annotations;
}

/**
 * Merges new citations with existing ones, avoiding duplicates
 * @param {Array} existingCitations - Existing citations array
 * @param {Array} newCitations - New citations to merge
 * @returns {Array} Merged citations array
 */
function mergeCitations(existingCitations, newCitations) {
    const merged = [...existingCitations];
    
    for (const newCitation of newCitations) {
        // Check if citation already exists (by URL)
        const exists = merged.some(existing => existing.url === newCitation.url);
        if (!exists) {
            merged.push(newCitation);
        }
    }
    
    return merged;
}

/**
 * Formats a chunk for OpenAI compatibility with citations
 * @param {Object} chunk - The original chunk
 * @param {Object} citations - The citations object
 * @returns {Object} Formatted chunk
 */
function formatChunkForOpenAI(chunk, citations) {
    // If chunk is already in OpenAI format, add citations to the message
    if (chunk.choices && chunk.choices[0] && chunk.choices[0].message) {
        const message = chunk.choices[0].message;
        
        // Add citations if available
        if (citations.citations && citations.citations.length > 0) {
            message.citations = citations.citations;
            
            // Add annotations if available
            if (citations.annotations && citations.annotations.length > 0) {
                message.annotations = citations.annotations;
            }
        }
        
        return chunk;
    }
    
    // For non-OpenAI format chunks, return as-is
    return chunk;
}

/**
 * Extracts publisher name from URL
 * @param {string} url - The URL to extract publisher from
 * @returns {string} Publisher name
 */
function extractPublisherFromUrl(url) {
    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname;
        
        // Remove common subdomains and extensions
        const domain = hostname
            .replace(/^www\./, '')
            .replace(/\.com$|\.org$|\.net$|\.edu$|\.gov$|\.co\.uk$/, '')
            .split('.')[0];
        
        // Capitalize first letter of each word
        return domain
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    } catch (error) {
        log('Error extracting publisher from URL:', url, error);
        return 'Unknown';
    }
}

/**
 * Creates a final citation summary for streaming responses
 * @param {Object} accumulatedCitations - The accumulated citations
 * @returns {Object} Final citation summary
 */
export function createFinalCitationSummary(accumulatedCitations) {
    return {
        citations: accumulatedCitations.citations || [],
        annotations: accumulatedCitations.annotations || [],
        total_citations: accumulatedCitations.citations?.length || 0
    };
}
