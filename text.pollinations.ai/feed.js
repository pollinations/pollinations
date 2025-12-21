import debug from "debug";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const log = debug("pollinations:feed");

// Map to store connected clients
const connectedClients = new Map();
// Map to store authenticated clients (for private requests)
const authenticatedClients = new Map();

// Get feed password from environment, default to a placeholder if not set
const PLN_FEED_PASSWORD = process.env.PLN_FEED_PASSWORD;

function sendToFeedListeners(response, requestParams, ip) {
    // Always log statistics for all requests (private and public)
    const isPrivate = requestParams.isPrivate === true;

    // For all regular clients, only send non-private requests
    for (const [_, send] of connectedClients) {
        if (!isPrivate) {
            log("broadcasting public response to", connectedClients.size);
            send(response, requestParams, ip);
        }
    }

    // For authenticated clients, send all requests (including private ones)
    for (const [_, send] of authenticatedClients) {
        log(
            "broadcasting " +
                (isPrivate ? "private" : "public") +
                " response to authenticated client",
        );
        send(response, requestParams, ip);
    }
}

function setupFeedEndpoint(app) {
    // Single feed endpoint with optional password parameter
    app.get("/feed", (req, res) => {
        const providedPassword = req.query.password;
        const isAuthenticated = providedPassword === PLN_FEED_PASSWORD;

        res.writeHead(200, {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
        });

        // Generate client ID
        const clientId = Date.now();

        if (isAuthenticated) {
            // For authenticated clients - add to authenticated list and include private requests
            log(
                "Authenticated client connected, total:",
                authenticatedClients.size + 1,
            );

            authenticatedClients.set(clientId, (response, parameters, ip) => {
                const eventData = {
                    response,
                    parameters,
                    ip, // Include IP for authenticated clients
                    isPrivate: parameters.isPrivate === true,
                };
                // Properly encode the data for SSE
                const encodedData = JSON.stringify(eventData)
                    .replace(/\n/g, "\\n")
                    .replace(/\r/g, "\\r");
                res.write(`data: ${encodedData}\n\n`);
            });

            // Remove the client when they disconnect
            req.on("close", () => {
                authenticatedClients.delete(clientId);
                log(
                    "Authenticated client disconnected, remaining:",
                    authenticatedClients.size,
                );
            });
        } else {
            // For regular clients - add to regular list and exclude private requests
            connectedClients.set(clientId, (response, parameters, ip) => {
                const eventData = {
                    response,
                    parameters,
                    // Don't include IP for non-authenticated clients
                };
                // Properly encode the data for SSE
                const encodedData = JSON.stringify(eventData)
                    .replace(/\n/g, "\\n")
                    .replace(/\r/g, "\\r");
                res.write(`data: ${encodedData}\n\n`);
            });

            // Remove the client when they disconnect
            req.on("close", () => {
                connectedClients.delete(clientId);
            });
        }
    });
}

export { setupFeedEndpoint, sendToFeedListeners };
