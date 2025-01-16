import * as EventSource from 'eventsource';
import debug from 'debug';

const log = debug('pollinations:monitor');

const FEED_URL = 'https://text.pollinations.ai/feed';
const modelStats = new Map();
const refererStats = new Map();
const ipStats = new Map();
let totalEntries = 0;

function updateStats(data) {
        const { parameters, ip } = JSON.parse(data);
        if (!parameters) return;
        
        const model = parameters.model || 'undefined';
        const referer = parameters.referrer || 'undefined';

        log('referer: %s', referer);
        
        log('Model: %s, Referer: %s, IP: %s', model, referer, ip);
        
        modelStats.set(model, (modelStats.get(model) || 0) + 1);
        refererStats.set(referer, (refererStats.get(referer) || 0) + 1);
        
        // Add first 3 letters of referrer to IP if not undefined
        const ipKey = referer !== 'undefined' ? `${ip} (${referer.slice(0, 30)})` : ip;
        ipStats.set(ipKey, (ipStats.get(ipKey) || 0) + 1);
        
        totalEntries++;
        
        // Clear screen and show updated stats
        // console.clear();
        log('Last updated: %s', new Date().toLocaleTimeString());
        log('Total entries: %d\n', totalEntries);
        
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
}

// Connect to SSE feed
const eventSource = new EventSource.EventSource(FEED_URL);

eventSource.onmessage = (event) => {
    updateStats(event.data);
};

eventSource.onerror = (error) => {
    log('EventSource failed: %O', error);
};

log('Connecting to feed...');
