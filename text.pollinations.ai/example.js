import FeedFilter from './filterFeed.js';
import debug from 'debug';

// Enable debug logging
debug.enable('pollinations:filter');

// Create a filter instance to match messages with no referrer
const filter = new FeedFilter({
    referrer: false  // Only show requests without a referrer
});

// Log matched messages
filter.onMessage(data => {
    console.log('Matched message:', {
        response: data.response.slice(0, 200) + '...',
        parameters: data.parameters
    });
});

// Start listening
filter.start();