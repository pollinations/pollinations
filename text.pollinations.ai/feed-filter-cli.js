#!/usr/bin/env node

import * as EventSource from 'eventsource';
import debug from 'debug';
import dotenv from 'dotenv';

// Load environment variables for feed password
dotenv.config();

const log = debug('pollinations:filter');
debug.enable('pollinations:filter');

// Enhanced stats for tracking message counts and categorical properties
const stats = {
    total: 0,
    private: 0,
    public: 0,
    models: {},
    referrers: {},
    hasMarkdown: 0,
    hasHtml: 0,
    isRoblox: 0,
    isImagePollinationsReferrer: 0
};

// Helper functions for content detection
const hasMarkdown = (text) => {
    const markdownPatterns = [
        /#{1,6}\s+.+/,      // Headers
        /\[.+\]\(.+\)/,     // Links
        /\*\*.+\*\*/,       // Bold
        /`.+`/,             // Code
        /^\s*[-*+]\s+/m,    // Lists
        /^\s*\d+\.\s+/m     // Numbered lists
    ];
    return markdownPatterns.some(pattern => pattern.test(text));
};

const hasHtml = (text) => /<[^>]+>/i.test(text);

// Helper function to truncate text
const truncate = (text, maxLength = 300) => {
    if (!text) return '';
    return text.length > maxLength ? text.slice(0, maxLength) + '...' : text;
};

// Helper function to convert messages to markdown
const messagesToMarkdown = (messages) => {
    if (!Array.isArray(messages)) return '';
    return messages.map(msg => 
        `**${msg.role}**:\n\n${truncate(msg.content)}\n`
    ).join('\n---\n\n');
};

// Helper function to increment counter for a category
const incrementCategoryCount = (category, value) => {
    if (!value) return;
    
    if (!stats[category][value]) {
        stats[category][value] = 1;
    } else {
        stats[category][value]++;
    }
};

// Filter function that checks if a message matches the criteria
const matchesFilters = (data, options = {}) => {
    const { response, parameters, isPrivate } = data;
    const referrer = parameters?.referrer;

    // Filter by privacy status
    if (options.onlyPrivate && !isPrivate) return false;
    if (options.onlyPublic && isPrivate) return false;

    if (options.noRoblox && referrer && referrer.toLowerCase().includes('roblox')) return false;

    if (options.referrer !== undefined) {
        if (options.referrer === false && referrer) return false;
        if (options.referrer instanceof RegExp && (!referrer || !options.referrer.test(referrer))) return false;
        if (typeof options.referrer === 'string' && referrer !== options.referrer) return false;
    }

    // Check for markdown OR html if either option is specified
    if (options.hasMarkdown !== undefined || options.hasHtml !== undefined) {
        const hasMarkdownMatch = options.hasMarkdown === undefined || hasMarkdown(response) === options.hasMarkdown;
        const hasHtmlMatch = options.hasHtml === undefined || hasHtml(response) === options.hasHtml;
        if (!hasMarkdownMatch && !hasHtmlMatch) return false;
    }

    return true;
};

// Helper function to calculate percentage
const calculatePercentage = (count, total) => {
    if (total === 0) return '0.00%';
    return ((count / total) * 100).toFixed(2) + '%';
};

// Helper function to sort object by values in descending order
const sortObjectByValues = (obj) => {
    return Object.entries(obj)
        .sort((a, b) => b[1] - a[1])
        .reduce((acc, [key, value]) => {
            acc[key] = value;
            return acc;
        }, {});
};

// Print current stats
const printStats = () => {
    log('\nStats:');
    log(`Total messages: ${stats.total}`);
    log(`Public messages: ${stats.public} (${calculatePercentage(stats.public, stats.total)})`);
    log(`Private messages: ${stats.private} (${calculatePercentage(stats.private, stats.total)})`);
    
    if (stats.hasMarkdown > 0 || stats.hasHtml > 0) {
        log('\nContent Types:');
        log(`Contains Markdown: ${stats.hasMarkdown} (${calculatePercentage(stats.hasMarkdown, stats.total)})`);
        log(`Contains HTML: ${stats.hasHtml} (${calculatePercentage(stats.hasHtml, stats.total)})`);
    }
    
    if (Object.keys(stats.models).length > 0) {
        log('\nModels:');
        const sortedModels = sortObjectByValues(stats.models);
        Object.entries(sortedModels).forEach(([model, count]) => {
            log(`${model}: ${count} (${calculatePercentage(count, stats.total)})`);
        });
    }
    
    if (Object.keys(stats.referrers).length > 0) {
        log('\nReferrers:');
        const sortedReferrers = sortObjectByValues(stats.referrers);
        Object.entries(sortedReferrers).forEach(([referrer, count]) => {
            log(`${referrer || 'none'}: ${count} (${calculatePercentage(count, stats.total)})`);
        });
    }
    
    log('\nSpecial Referrers:');
    log(`Roblox: ${stats.isRoblox} (${calculatePercentage(stats.isRoblox, stats.total)})`);
    log(`Image Pollinations: ${stats.isImagePollinationsReferrer} (${calculatePercentage(stats.isImagePollinationsReferrer, stats.total)})`);
    
    log('-'.repeat(30));
};

// Main function to start the feed listener
const startFeedListener = (options = {}) => {
    // Determine which feed URL to use based on options
    let baseUrl = options.baseUrl || 'https://text.pollinations.ai';
    let feedUrl = `${baseUrl}/feed`;
    
    // If private feed access is requested, check for password
    if (options.includePrivate || options.onlyPrivate) {
        const password = options.password || process.env.FEED_PASSWORD;
        
        if (password) {
            feedUrl = `${baseUrl}/feed?password=${encodeURIComponent(password)}`;
            log('Using authenticated feed (includes private messages)');
        } else {
            log('WARNING: Private messages requested but no password provided');
            log('Set password with --password or FEED_PASSWORD in .env file');
        }
    }
    
    log(`Connecting to feed at ${feedUrl.replace(/password=([^&]+)/, 'password=[REDACTED]')}`);
    const eventSource = new EventSource.EventSource(feedUrl);
    
    eventSource.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            
            if (matchesFilters(data, options)) {
                stats.total++;
                if (data.isPrivate) {
                    stats.private++;
                } else {
                    stats.public++;
                }
                
                // Track categorical properties
                const { parameters, response } = data;
                
                // Track model usage
                if (parameters?.model) {
                    incrementCategoryCount('models', parameters.model);
                }
                
                // Track referrers
                incrementCategoryCount('referrers', parameters?.referrer);
                
                // Track content types
                if (hasMarkdown(response)) {
                    stats.hasMarkdown++;
                }
                if (hasHtml(response)) {
                    stats.hasHtml++;
                }
                
                // Track special referrers
                if (parameters?.referrer && parameters.referrer.toLowerCase().includes('roblox')) {
                    stats.isRoblox++;
                }
                if (parameters?.isImagePollinationsReferrer) {
                    stats.isImagePollinationsReferrer++;
                }
                
                // Only display content if not in count-only mode
                if (!options.countOnly) {
                    // Add privacy indicator to the output
                    const privacyStatus = data.isPrivate ? '🔒 PRIVATE' : '🌐 PUBLIC';
                    
                    console.log(`\n# ${privacyStatus} Message\n`);
                    console.log(`Referrer: ${data.parameters?.referrer || 'none'}`);
                    if (data.ip) console.log(`IP: ${data.ip}`);
                    console.log('\n# Response\n');
                    console.log(truncate(data.response));
                    console.log('\n# Messages\n');
                    console.log(messagesToMarkdown(data.parameters.messages));
                    console.log('\n-------------------\n');
                }
                
                // Print stats based on mode
                if (options.countOnly) {
                    // In count-only mode, update stats more frequently
                    if (stats.total % 5 === 0) {
                        printStats();
                    }
                } else if (stats.total % 10 === 0) {
                    // In normal mode, print stats every 10 messages
                    printStats();
                }
            }
        } catch (error) {
            log('Error processing message: %O', error);
        }
    };

    eventSource.onerror = (error) => {
        if (error && error.status === 401) {
            log('Authentication failed: Invalid password');
            process.exit(1);
        } else {
            log('EventSource failed: %O', error);
        }
    };

    log('Connected to feed with filters: %O', options);

    // Handle cleanup on process exit
    process.on('SIGINT', () => {
        eventSource.close();
        printStats();
        log('Disconnected from feed');
        process.exit(0);
    });
};

// Parse command line arguments
const parseArgs = () => {
    const args = process.argv.slice(2);
    const options = {};
    
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        
        switch (arg) {
            case '--no-referrer':
                options.referrer = false;
                break;
            case '--referrer':
                options.referrer = args[++i];
                break;
            case '--has-markdown':
                options.hasMarkdown = true;
                break;
            case '--has-html':
                options.hasHtml = true;
                break;
            case '--no-roblox':
                options.noRoblox = true;
                break;
            case '--private':
                options.includePrivate = true;
                break;
            case '--only-private':
                options.onlyPrivate = true;
                break;
            case '--only-public':
                options.onlyPublic = true;
                break;
            case '--password':
                options.password = args[++i];
                break;
            case '--base-url':
                options.baseUrl = args[++i];
                break;
            case '--count-only':
                options.countOnly = true;
                break;
            case '--help':
                console.log(`
Usage: node feed-filter-cli.js [options]

Options:
  --no-referrer        Only show messages without a referrer
  --referrer <value>   Filter by specific referrer
  --has-markdown       Only show messages containing markdown
  --has-html           Only show messages containing HTML
  --no-roblox          Filter out messages with Roblox referrers
  --private            Include private messages (requires password)
  --only-private       Show only private messages (requires password)
  --only-public        Show only public messages
  --password <value>   Password for accessing private messages
  --base-url <url>     Base URL for API (default: https://text.pollinations.ai)
  --count-only         Only display statistics, not individual messages
  --help               Show this help message

Environment:
  FEED_PASSWORD        Can be set in .env file instead of using --password
`);
                process.exit(0);
        }
    }
    return options;
};

// Start the application
const options = parseArgs();
startFeedListener(options);
