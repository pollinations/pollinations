import { ServerTransport } from '@modelcontextprotocol/sdk/server/index.js';

/**
 * ServerTransport implementation using Server-Sent Events (SSE)
 */
export class SseServerTransport extends ServerTransport {
  /**
   * Create a new SseServerTransport
   * @param {object} req - Express request object
   * @param {object} res - Express response object
   */
  constructor(req, res) {
    super();
    this.req = req;
    this.res = res;
    this.closed = false;
    this.requestQueue = [];
    
    // Set up request handlers
    this.req.on('close', () => {
      this.closed = true;
      this.closeListeners.forEach(listener => listener());
    });
    
    // Listen for request events from the client
    this.req.on('data', (data) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.type === 'request') {
          this.requestQueue.push(message);
          this.requestListeners.forEach(listener => listener());
        }
      } catch (error) {
        console.error('Error parsing request data:', error);
      }
    });
  }
  
  /**
   * Send a message to the client
   * @param {object} message - The message to send
   */
  async send(message) {
    if (this.closed) {
      throw new Error('Transport closed');
    }
    
    try {
      // Format message for SSE
      const data = JSON.stringify(message);
      this.res.write(`event: message\ndata: ${data}\n\n`);
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  }
  
  /**
   * Receive a message from the client
   */
  async receive() {
    return new Promise((resolve, reject) => {
      if (this.closed) {
        return reject(new Error('Transport closed'));
      }
      
      if (this.requestQueue.length > 0) {
        // If we already have a request in the queue, return it
        resolve(this.requestQueue.shift());
      } else {
        // Otherwise, wait for a request
        const listener = () => {
          if (this.requestQueue.length > 0) {
            this.removeRequestListener(listener);
            resolve(this.requestQueue.shift());
          }
        };
        
        this.addRequestListener(listener);
        
        // Also listen for transport close
        const closeListener = () => {
          this.removeRequestListener(listener);
          reject(new Error('Transport closed while waiting for message'));
        };
        
        this.addCloseListener(closeListener);
      }
    });
  }
  
  /**
   * Close the transport
   */
  async close() {
    if (!this.closed) {
      this.closed = true;
      this.closeListeners.forEach(listener => listener());
      
      // End the response
      this.res.end();
    }
  }
  
  // Request listeners
  requestListeners = [];
  
  addRequestListener(listener) {
    this.requestListeners.push(listener);
  }
  
  removeRequestListener(listener) {
    this.requestListeners = this.requestListeners.filter(l => l !== listener);
  }
  
  // Close listeners
  closeListeners = [];
  
  addCloseListener(listener) {
    this.closeListeners.push(listener);
  }
  
  removeCloseListener(listener) {
    this.closeListeners = this.closeListeners.filter(l => l !== listener);
  }
}
