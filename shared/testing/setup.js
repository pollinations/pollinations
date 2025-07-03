/**
 * Shared testing utilities for Pollinations services
 * 
 * This module provides utilities for starting and stopping services for integration testing.
 */

import { spawn } from 'child_process';
import { createServer } from 'http';
import supertest from 'supertest';

/**
 * Starts a service and returns a configured supertest instance
 * @param {Object} options - Configuration options
 * @param {string} options.command - Command to start the service
 * @param {string} options.cwd - Working directory for the service
 * @param {number} options.port - Port the service will run on
 * @param {string} options.readyPattern - Console output pattern indicating service is ready
 * @param {number} options.timeout - Timeout in ms to wait for service to start
 * @returns {Object} - { request, stop } where request is a supertest instance and stop is a function
 */
export async function startService({ 
  command, 
  cwd, 
  port = 3000, 
  readyPattern = 'Server started', 
  timeout = 10000 
}) {
  return new Promise((resolve, reject) => {
    // Split command into command and args
    const [cmd, ...args] = command.split(' ');
    
    // Start the service
    const proc = spawn(cmd, args, { 
      cwd, 
      env: { ...process.env, PORT: port },
      shell: true
    });
    
    // Track if service has started
    let serviceStarted = false;
    
    // Set timeout
    const timeoutId = setTimeout(() => {
      if (!serviceStarted) {
        proc.kill();
        reject(new Error(`Service failed to start within ${timeout}ms`));
      }
    }, timeout);
    
    // Listen for ready pattern in stdout
    proc.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(output);
      
      if (output.includes(readyPattern)) {
        serviceStarted = true;
        clearTimeout(timeoutId);
        
        // Create supertest instance
        const request = supertest(`http://localhost:${port}`);
        
        // Create stop function
        const stop = () => {
          return new Promise((resolveStop) => {
            proc.on('close', () => resolveStop());
            proc.kill();
          });
        };
        
        resolve({ request, stop });
      }
    });
    
    // Handle errors
    proc.stderr.on('data', (data) => {
      console.error(data.toString());
    });
    
    proc.on('error', (err) => {
      clearTimeout(timeoutId);
      reject(err);
    });
    
    proc.on('close', (code) => {
      if (!serviceStarted) {
        clearTimeout(timeoutId);
        reject(new Error(`Service exited with code ${code} before starting`));
      }
    });
  });
}

/**
 * Creates a mock server for testing
 * @param {Function} handler - Request handler function (req, res) => void
 * @param {number} port - Port to run on (0 for random)
 * @returns {Object} - { request, server, url }
 */
export function createTestServer(handler, port = 0) {
  const server = createServer(handler);
  
  return new Promise((resolve) => {
    server.listen(port, () => {
      const { port } = server.address();
      const url = `http://localhost:${port}`;
      const request = supertest(url);
      
      resolve({ request, server, url });
    });
  });
}