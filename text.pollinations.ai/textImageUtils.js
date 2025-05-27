/**
 * Utility functions for handling image content in text generation
 */

/**
 * Validates and limits image content in messages to maximum 5 images per request
 * @param {Array} messages - Array of message objects
 * @returns {Array} - Messages with image content limited to 5 images max
 */
export function limitImageContent(messages) {
    if (!Array.isArray(messages)) {
        return messages;
    }

    let totalImageCount = 0;
    const MAX_IMAGES = 5;

    return messages.map(message => {
        if (!message.content || !Array.isArray(message.content)) {
            return message;
        }

        const limitedContent = [];
        
        for (const item of message.content) {
            // Add text content without restrictions
            if (item.type === 'text') {
                limitedContent.push(item);
                continue;
            }
            
            // Add image content only if we haven't reached the limit
            if (item.type === 'image_url' && totalImageCount < MAX_IMAGES) {
                limitedContent.push(item);
                totalImageCount++;
            }
            // Skip additional images beyond the limit
        }

        return {
            ...message,
            content: limitedContent
        };
    });
}

/**
 * Counts the total number of images across all messages
 * @param {Array} messages - Array of message objects
 * @returns {number} - Total number of images
 */
export function countImages(messages) {
    if (!Array.isArray(messages)) {
        return 0;
    }

    return messages.reduce((total, message) => {
        if (!message.content || !Array.isArray(message.content)) {
            return total;
        }

        return total + message.content.filter(item => item.type === 'image_url').length;
    }, 0);
}
