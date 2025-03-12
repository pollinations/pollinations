import debug from 'debug';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const log = debug('pollinations:feed');

// Map to store connected clients
const connectedClients = new Map();
// Map to store authenticated clients (for private requests)
const authenticatedClients = new Map();

// Get feed password from environment, default to a placeholder if not set
const FEED_PASSWORD = process.env.FEED_PASSWORD || 'default_secure_password';

function sendToFeedListeners(response, requestParams, ip) {
    // Always log statistics for all requests (private and public)
    const isPrivate = requestParams.isPrivate === true;
    
    // For all regular clients, only send non-private requests
    for (const [_, send] of connectedClients) {
        if (!isPrivate) {
            log('broadcasting public response to', connectedClients.size);
            send(response, requestParams, ip);
        }
    }
    
    // For authenticated clients, send all requests (including private ones)
    for (const [_, send] of authenticatedClients) {
        log('broadcasting ' + (isPrivate ? 'private' : 'public') + ' response to authenticated client');
        send(response, requestParams, ip);
    }
}

function setupFeedEndpoint(app) {
    // Original feed endpoint (public requests only)
    app.get('/feed', (req, res) => {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        });

        // Add the client to a list of connected clients
        const clientId = Date.now();
        connectedClients.set(clientId, (response, parameters, ip) => {
            const eventData = {
                response,
                parameters,
                // ip
            };
            // Properly encode the data for SSE
            const encodedData = JSON.stringify(eventData)
                .replace(/\n/g, '\\n')
                .replace(/\r/g, '\\r');
            res.write(`data: ${encodedData}\n\n`);
        });

        // Remove the client when they disconnect
        req.on('close', () => {
            connectedClients.delete(clientId);
        });
    });
    
    // Authenticated feed endpoint (all requests including private ones)
    app.get('/feed/private', (req, res) => {
        const providedPassword = req.query.password;
        
        // Check if the password is correct
        if (providedPassword !== FEED_PASSWORD) {
            return res.status(401).json({ error: 'Unauthorized: Invalid password' });
        }
        
        res.writeHead(200, {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Connection': 'keep-alive'
        });

        // Add client to authenticated clients list
        const clientId = Date.now();
        authenticatedClients.set(clientId, (response, parameters, ip) => {
            const eventData = {
                response,
                parameters,
                ip, // Include IP for authenticated clients
                isPrivate: parameters.isPrivate === true
            };
            // Properly encode the data for SSE
            const encodedData = JSON.stringify(eventData)
                .replace(/\n/g, '\\n')
                .replace(/\r/g, '\\r');
            res.write(`data: ${encodedData}\n\n`);
        });

        // Remove the client when they disconnect
        req.on('close', () => {
            authenticatedClients.delete(clientId);
            log('Authenticated client disconnected, remaining:', authenticatedClients.size);
        });
        
        log('Authenticated client connected, total:', authenticatedClients.size);
    });
}

export { setupFeedEndpoint, sendToFeedListeners };
