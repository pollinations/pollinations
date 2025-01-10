import debug from 'debug';

const log = debug('pollinations:feed');

// Map to store connected clients
const connectedClients = new Map();

function sendToFeedListeners(response, requestParams, ip) {
    for (const [_, send] of connectedClients) {
        log('broadcasting response', response, "to", connectedClients.size);
        send(response, requestParams, ip);
    }
}

function setupFeedEndpoint(app) {
    app.get('/feed', (req, res) => {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        });

        // Add the client to a list of connected clients
        const clientId = Date.now();
        connectedClients.set(clientId, (response, parameters, ip) => {
            res.write(`data: ${JSON.stringify({ 
                response, 
                parameters, 
                ip 
            })}\n\n`);
        });

        // Remove the client when they disconnect
        req.on('close', () => {
            connectedClients.delete(clientId);
        });
    });
}

export { setupFeedEndpoint, sendToFeedListeners };
