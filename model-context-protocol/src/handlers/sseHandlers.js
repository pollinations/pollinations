// SSE handlers for the Pollinations MCP server
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';

/**
 * Creates SSE handlers for Express
 * @param {Object} options - Configuration options
 * @param {Object} options.server - MCP server instance
 * @returns {Object} SSE handlers
 */
export function createSseHandlers({ server }) {
  // Store the transport instance to be used by the message handler
  let sseTransport;

  /**
   * SSE connection handler
   * Establishes a Server-Sent Events connection for server-to-client streaming
   */
  const handleSseConnection = (req, res) => {
    console.error('SSE connection established');
    
    // Let the SDK handle the SSE transport
    sseTransport = new SSEServerTransport('/messages', res);
    
    // Connect the MCP server to the SSE transport
    server.connect(sseTransport).catch(error => {
      console.error('Error connecting SSE transport:', error);
    });
  };

  /**
   * Message handler for client-to-server communication
   * Processes messages sent by the client via POST requests
   */
  const handlePostMessage = async (req, res) => {
    if (!sseTransport) {
      return res.status(400).json({ 
        error: 'No active SSE connection found. Connect to /sse first.' 
      });
    }

    try {
      // Let the SDK handle the message, explicitly passing the request body
      await sseTransport.handlePostMessage(req, res, req.body);
    } catch (error) {
      console.error('Error handling message:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  return {
    handleSseConnection,
    handlePostMessage
  };
}
