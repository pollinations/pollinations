import axios from 'axios';
import debug from 'debug';
import { GenerateTextWithHistory, ApiMessage } from './types';
import { NetworkTimeoutError } from './errors';

const log = debug('app:api');

// Timeout duration in milliseconds
const API_TIMEOUT_MS = 50000; // 50 seconds

/**
 * Create a text generation function for the Pollinations API
 */
export const createGenerateTextWithHistory = (baseUrl: string): GenerateTextWithHistory => {
  log('API Client created with baseUrl: %s', baseUrl);

  // No rate limiting needed - let the API handle concurrent requests

  /**
   * Generate text using conversation history
   */
  return async (messages: ApiMessage[], model: string, systemPrompt?: string): Promise<string> => {
    const url = `${baseUrl}/chat/completions`;
    const apiMessages = [
      ...(systemPrompt ? [{ role: 'user', content: systemPrompt }] : []),
      ...messages
    ];

    const requestData = { model, messages: apiMessages};

    // Log equivalent curl command for debugging
    const curlCommand = `curl -X POST ${url} \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(requestData, null, 2)}'`;

    log('Equivalent curl command:\n%s', curlCommand);

    try {
      // Create a promise that will reject after the timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Request timed out after ${API_TIMEOUT_MS}ms`));
        }, API_TIMEOUT_MS);
      });

      // Create the actual request promise
      const requestPromise = axios.post(url, requestData, {
        headers: {
          'Referer': 'roblox',
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.TEXT_POLLINATIONS_TOKEN}`
        }
      });

      // Race the request against the timeout
      const response = await Promise.race([requestPromise, timeoutPromise]);

      return response.data.choices[0].message.content;
    } catch (error: any) {
      
      // Handle timeout errors
      if (error.message?.includes('Request timed out')) {
        log('Request timed out after %dms, waiting 60s before next request', API_TIMEOUT_MS);
        await new Promise(resolve => setTimeout(resolve, 60000));
        throw new NetworkTimeoutError(API_TIMEOUT_MS);
      }
      
      // Handle all other API errors - return empty string instead of throwing
      log('API request failed for model %s: %s', model, error.message);
      
      // Log response body if available (for HTTP errors like 502)
      if (error.response) {
        log('HTTP Error Status: %d', error.response.status);
        log('HTTP Error Headers: %O', error.response.headers);
        if (error.response.data) {
          log('HTTP Error Response Body: %O', error.response.data);
        }
      } else if (error.request) {
        log('No response received. Request details: %O', error.request);
      }
      
      await new Promise(resolve => setTimeout(resolve, 60000)); // Wait before next request
      return ''; // Return empty string for non-timeout errors
    }
  };
};
