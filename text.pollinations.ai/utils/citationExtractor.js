/**
 * Citation extraction utilities for Vertex AI Google Search responses
 * Extracts grounding metadata and formats it into OpenAI-compatible citation format
 */

import debug from 'debug';
const log = debug('text.pollinations.ai:citationExtractor');

/**
 * Extracts citation metadata from Vertex AI response
 * @param {Object} response - The response from Vertex AI
 * @returns {Array} Array of citation objects
 */
export function extractCitations(response) {
    try {
        // Check if response has grounding metadata
        const groundingMetadata = response?.candidates?.[0]?.groundingMetadata;
        if (!groundingMetadata) {
            log('No grounding metadata found in response');
            return [];
        }

        // Extract web search grounding info
        const webSearchQueries = groundingMetadata.webSearchQueries || [];
        const groundingChunks = groundingMetadata.groundingChunks || [];

        const citations = [];

        // Process each grounding chunk
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

                // Only add citation if it has essential information
                if (citation.url && citation.title !== 'Untitled') {
                    citations.push(citation);
                }
            }
        }

        log(`Extracted ${citations.length} citations from grounding metadata`);
        return citations;

    } catch (error) {
        log('Error extracting citations:', error);
        return [];
    }
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
 * Creates citation annotations for text content
 * Maps citations to specific text ranges based on grounding metadata
 * @param {string} content - The text content
 * @param {Array} citations - Array of citation objects
 * @param {Object} groundingMetadata - The grounding metadata from response
 * @returns {Array} Array of annotation objects
 */
export function createCitationAnnotations(content, citations, groundingMetadata) {
    try {
        const annotations = [];
        
        if (!groundingMetadata?.groundingChunks) {
            return annotations;
        }

        // Process grounding chunks to create annotations
        for (const chunk of groundingMetadata.groundingChunks) {
            if (chunk.web && chunk.web.uri && chunk.startIndex !== undefined && chunk.endIndex !== undefined) {
                // Find the corresponding citation
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

        log(`Created ${annotations.length} citation annotations`);
        return annotations;

    } catch (error) {
        log('Error creating citation annotations:', error);
        return [];
    }
}

/**
 * Formats citations for OpenAI-compatible response
 * @param {Array} citations - Array of citation objects
 * @returns {Array} Formatted citation array
 */
export function formatCitationsForOpenAI(citations) {
    return citations.map(citation => ({
        title: citation.title,
        url: citation.url,
        snippet: citation.snippet,
        publisher: citation.publisher,
        published_date: citation.published_date,
        confidence_score: citation.confidence_score
    }));
}

/**
 * Checks if a response contains search grounding metadata
 * @param {Object} response - The response object
 * @returns {boolean} True if response contains grounding metadata
 */
export function hasGroundingMetadata(response) {
    return !!(
        response?.candidates?.[0]?.groundingMetadata ||
        response?.groundingMetadata ||
        response?.usageMetadata?.groundingMetadata
    );
}

/**
 * Processes a Vertex AI response to extract and format citations
 * @param {Object} response - The response from Vertex AI
 * @param {string} modelName - The model name (to identify if it's gemini-search)
 * @returns {Object} Object containing citations and annotations
 */
export function processResponseCitations(response, modelName) {
    // Only process citations for gemini-search model
    if (!modelName || !modelName.includes('search')) {
        return { citations: [], annotations: [] };
    }

    try {
        const citations = extractCitations(response);
        const annotations = createCitationAnnotations(
            response?.candidates?.[0]?.content?.parts?.[0]?.text || '',
            citations,
            response?.candidates?.[0]?.groundingMetadata
        );

        return {
            citations: formatCitationsForOpenAI(citations),
            annotations
        };

    } catch (error) {
        log('Error processing response citations:', error);
        return { citations: [], annotations: [] };
    }
}
