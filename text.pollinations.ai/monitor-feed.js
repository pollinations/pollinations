import * as EventSource from 'eventsource';

const FEED_URL = 'https://text.pollinations.ai/feed';
const modelStats = new Map();
const refererStats = new Map();
let totalEntries = 0;

function updateStats(data) {
        const { parameters } = JSON.parse(data);
        if (!parameters) return;
        
        const model = parameters.model || 'undefined';
        const referer = parameters.referer || 'undefined';
        
        console.log(`Model: ${model}, Referer: ${referer}`);
        
        modelStats.set(model, (modelStats.get(model) || 0) + 1);
        refererStats.set(referer, (refererStats.get(referer) || 0) + 1);
        totalEntries++;
        
        // Clear screen and show updated stats
        console.clear();
        console.log(`Last updated: ${new Date().toLocaleTimeString()}`);
        console.log(`Total entries: ${totalEntries}\n`);
        
        // Models table
        console.log('Models:');
        const modelTable = Array.from(modelStats.entries()).map(([model, count]) => ({
            model,
            count,
            percentage: ((count / totalEntries) * 100).toFixed(1) + '%'
        }));
        console.table(modelTable);
        
        // Referers table
        console.log('\nReferers:');
        const refererTable = Array.from(refererStats.entries()).map(([referer, count]) => ({
            referer,
            count,
            percentage: ((count / totalEntries) * 100).toFixed(1) + '%'
        }));
        console.table(refererTable);
}

// Connect to SSE feed
const eventSource = new EventSource.EventSource(FEED_URL);

eventSource.onmessage = (event) => {
    updateStats(event.data);
};

eventSource.onerror = (error) => {
    console.error('EventSource failed:', error);
};

console.log('Connecting to feed...');
