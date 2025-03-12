import * as EventSource from 'eventsource';
import debug from 'debug';
import dotenv from 'dotenv';

// Load environment variables (for password)
dotenv.config();

const log = debug('pollinations:monitor');

const BASE_URL = 'https://text.pollinations.ai';
const modelStats = new Map();
const refererStats = new Map();
const ipStats = new Map();
const privacyStats = new Map(); // Track private vs public requests
let totalEntries = 0;

// Parse command line arguments
const args = process.argv.slice(2);
const filters = {
    noReferrer: args.includes('--no-referrer'),
    referrer: args.find(arg => arg.startsWith('--referrer='))?.split('=')[1],
    hasMarkdown: args.includes('--markdown'),
    hasHtml: args.includes('--html'),
    model: args.find(arg => arg.startsWith('--model='))?.split('=')[1],
    showRaw: args.includes('--raw'),
    password: args.find(arg => arg.startsWith('--password='))?.split('=')[1] || process.env.FEED_PASSWORD,
    includePrivate: args.includes('--private') || args.includes('--all'),
    onlyPrivate: args.includes('--only-private')
};

// Helper functions for content detection
function hasMarkdown(text) {
    const patterns = [
        /#{1,6}\s+.+/,      // Headers
        /\[.+\]\(.+\)/,     // Links
        /\*\*.+\*\*/,       // Bold
        /`.+`/,             // Code
        /^\s*[-*+]\s+/m,    // Lists
        /^\s*\d+\.\s+/m     // Numbered lists
    ];
    return patterns.some(pattern => pattern.test(text));
}

function hasHtml(text) {
    return /<[^>]+>/i.test(text);
}

function matchesFilters(data) {
    const { parameters, response, isPrivate } = data;
    if (!parameters) return false;

    const referer = parameters.referrer || 'undefined';
    const model = parameters.model || 'undefined';
    
    // Filter by privacy status if applicable
    if (filters.onlyPrivate && !isPrivate) return false;

    // Filter by referrer
    if (filters.noReferrer && referer !== 'undefined') return false;
    if (filters.referrer) {
        if (filters.referrer.startsWith('/') && filters.referrer.endsWith('/')) {
            // Regex pattern
            const pattern = new RegExp(filters.referrer.slice(1, -1));
            if (!pattern.test(referer)) return false;
        } else if (referer !== filters.referrer) {
            return false;
        }
    }

    // Filter by model
    if (filters.model && model !== filters.model) return false;

    // Filter by content type
    if (filters.hasMarkdown && !hasMarkdown(response)) return false;
    if (filters.hasHtml && !hasHtml(response)) return false;

    return true;
}

function updateStats(eventData) {
    try {
        const data = JSON.parse(eventData);
        if (!matchesFilters(data)) return;

        const { parameters, response, ip, isPrivate } = data;
        if (!parameters) return;
        
        const model = parameters.model || 'undefined';
        const referer = parameters.referrer || 'undefined';
        const privacyStatus = isPrivate ? 'private' : 'public';

        // Show raw message if requested
        if (filters.showRaw) {
            log('\nMatched message:');
            log('Model: %s', model);
            log('Referer: %s', referer);
            log('Privacy: %s', privacyStatus);
            log('Response: %s', response);
            log('---');
            return;
        }
        
        modelStats.set(model, (modelStats.get(model) || 0) + 1);
        refererStats.set(referer, (refererStats.get(referer) || 0) + 1);
        privacyStats.set(privacyStatus, (privacyStats.get(privacyStatus) || 0) + 1);
        
        const ipKey = referer !== 'undefined' ? `${ip} (${referer.slice(0, 30)})` : ip;
        ipStats.set(ipKey, (ipStats.get(ipKey) || 0) + 1);
        
        totalEntries++;
        
        log('Last updated: %s', new Date().toLocaleTimeString());
        log('Total filtered entries: %d\n', totalEntries);
        
        // Privacy stats table
        if (filters.includePrivate || filters.onlyPrivate) {
            log('Privacy:');
            const privacyTable = Array.from(privacyStats.entries()).map(([status, count]) => ({
                status,
                count,
                percentage: ((count / totalEntries) * 100).toFixed(1) + '%'
            }));
            log('%O', privacyTable);
        }
        
        // Models table
        log('Models:');
        const modelTable = Array.from(modelStats.entries()).map(([model, count]) => ({
            model,
            count,
            percentage: ((count / totalEntries) * 100).toFixed(1) + '%'
        }));
        log('%O', modelTable);
        
        // Referers table
        log('\nReferers:');
        const refererTable = Array.from(refererStats.entries()).map(([referer, count]) => ({
            referer,
            count,
            percentage: ((count / totalEntries) * 100).toFixed(1) + '%'
        }));
        log('%O', refererTable);

        // IP addresses table (top 10)
        log('\nTop 10 IP Addresses:');
        const ipTable = Array.from(ipStats.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([ip, count]) => ({
                ip,
                count,
                percentage: ((count / totalEntries) * 100).toFixed(1) + '%'
            }));
        log('%O', ipTable);
    } catch (error) {
        log('Error processing message: %O', error);
    }
}

// Show startup message with active filters
log('Starting monitor with filters:');
Object.entries(filters).forEach(([key, value]) => {
    // Don't log the password
    if (key === 'password') {
        if (value) log('- %s: [REDACTED]', key);
    } else if (value) {
        log('- %s: %s', key, value);
    }
});

// Determine which feed URL to use
let feedURL = `${BASE_URL}/feed`;

// If we want to include private messages and have a password, add the password parameter
if ((filters.includePrivate || filters.onlyPrivate) && filters.password) {
    feedURL = `${BASE_URL}/feed?password=${encodeURIComponent(filters.password)}`;
    log('Connecting to authenticated feed (including private messages)');
} else if (filters.includePrivate || filters.onlyPrivate) {
    log('WARNING: You requested private messages but did not provide a password.');
    log('Private messages will not be included unless you provide a password.');
    log('Use --password=YourPassword or set FEED_PASSWORD in .env file');
}

// Connect to SSE feed
const eventSource = new EventSource.EventSource(feedURL);

eventSource.onmessage = (event) => {
    updateStats(event.data);
};

eventSource.onerror = (error) => {
    if (error && error.status === 401) {
        log('Authentication failed: Invalid password');
        process.exit(1);
    } else {
        log('EventSource failed: %O', error);
    }
};

log('\nConnecting to feed at %s...', feedURL.replace(/password=([^&]+)/, 'password=[REDACTED]'));
