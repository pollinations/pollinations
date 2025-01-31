import * as EventSource from 'eventsource';
import debug from 'debug';

const log = debug('pollinations:filter');

class FeedFilter {
    constructor(options = {}) {
        this.options = {
            referrer: null,      // String or RegExp to match referrer
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
        if (this.options.referrer) {
            if (!referrer) return false;
            if (this.options.referrer instanceof RegExp) {
                if (!this.options.referrer.test(referrer)) return false;
            } else if (referrer !== this.options.referrer) {
                return false;
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

    // Create a filter instance
    const filter = new FeedFilter({
        referrer: /pollinations\.ai$/,  // Only show requests from pollinations.ai domains
        hasMarkdown: true               // Only show responses containing markdown
    });

    // Add a handler for matching messages
    filter.onMessage(data => {
        log('Matched message:');
        log('Referrer: %s', data.parameters?.referrer);
        log('Response: %s', data.response.slice(0, 200) + '...');
        log('---');
    });

    // Start listening
    filter.start();
}

export default FeedFilter;