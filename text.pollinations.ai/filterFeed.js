import * as EventSource from 'eventsource';
import debug from 'debug';

const log = debug('pollinations:filter');

class FeedFilter {
    constructor(options = {}) {
        this.options = {
            referrer: null,      // String or RegExp to match referrer, or false to match no referrer
            hasMarkdown: null,   // Boolean to filter markdown content
            hasHtml: null,       // Boolean to filter HTML content
            ...options
        };
        
        this.eventSource = null;
        this.handlers = new Set();
    }

    // Helper methods to detect content types
    static hasMarkdown(text) {
        // Look for common markdown patterns
        const markdownPatterns = [
            /#{1,6}\s+.+/,      // Headers
            /\[.+\]\(.+\)/,     // Links
            /\*\*.+\*\*/,       // Bold
            /`.+`/,             // Code
            /^\s*[-*+]\s+/m,    // Lists
            /^\s*\d+\.\s+/m     // Numbered lists
        ];
        return markdownPatterns.some(pattern => pattern.test(text));
    }

    static hasHtml(text) {
        // Look for HTML tags
        return /<[^>]+>/i.test(text);
    }

    matchesFilters(data) {
        const { response, parameters } = data;
        const referrer = parameters?.referrer;

        // Referrer filter
        if (this.options.referrer !== null) {
            if (this.options.referrer === false) {
                // Match messages with no referrer
                if (referrer) return false;
            } else if (this.options.referrer instanceof RegExp) {
                // Match referrer against regex pattern
                if (!referrer || !this.options.referrer.test(referrer)) return false;
            } else {
                // Match exact referrer string
                if (referrer !== this.options.referrer) return false;
            }
        }

        // Content type filters
        if (this.options.hasMarkdown !== null) {
            const containsMarkdown = FeedFilter.hasMarkdown(response);
            if (containsMarkdown !== this.options.hasMarkdown) return false;
        }

        if (this.options.hasHtml !== null) {
            const containsHtml = FeedFilter.hasHtml(response);
            if (containsHtml !== this.options.hasHtml) return false;
        }

        return true;
    }

    onMessage(handler) {
        this.handlers.add(handler);
    }

    start(feedUrl = 'https://text.pollinations.ai/feed') {
        if (this.eventSource) {
            this.stop();
        }

        this.eventSource = new EventSource.EventSource(feedUrl);
        
        this.eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (this.matchesFilters(data)) {
                    this.handlers.forEach(handler => handler(data));
                }
            } catch (error) {
                log('Error processing message: %O', error);
            }
        };

        this.eventSource.onerror = (error) => {
            log('EventSource failed: %O', error);
        };

        log('Connected to feed with filters: %O', this.options);
    }

    stop() {
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
            log('Disconnected from feed');
        }
    }
}

// Example usage:
if (require.main === module) {
    // Enable debug logging
    debug.enable('pollinations:filter');

    // Create a filter instance to match messages with no referrer
    const filter = new FeedFilter({
        referrer: false  // Only show requests without a referrer
    });

    // Log matched messages
    filter.onMessage(data => {
        log('Matched message:');
        log('%O', {
            response: data.response.slice(0, 200) + '...',
            parameters: data.parameters
        });
    });

    // Start listening
    filter.start();
}

export default FeedFilter;