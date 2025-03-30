import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Hook for text editor functionality
 */
export const useTextEditor = ({ stop, entry }) => {
  const [currentEntry, setCurrentEntry] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const hasGeneratedEntry = useRef(false);

  // Update from parent entry if needed
  useEffect(() => {
    if (!entry) return;
    
    // Only update if we haven't generated our own entry or if we don't have an entry yet
    if (!hasGeneratedEntry.current || !currentEntry) {
      setCurrentEntry(entry);
    }
  }, [entry, currentEntry]);

  // Helper function to convert parameters to URL for GET request
  const createGetUrl = (parameters) => {
    if (!parameters || !parameters.messages || !parameters.messages.length) {
      return null;
    }

    // Extract the user prompt from messages
    const userMessage = parameters.messages.find(msg => msg?.role === 'user');
    let prompt = userMessage?.content || '';
    
    // Debug log to see what prompt is being used
    console.log('Creating URL with prompt:', prompt);
    
    // Ensure prompt isn't empty - use a placeholder if it is
    if (!prompt.trim()) {
      prompt = 'Hello';
      console.log('Empty prompt detected, using placeholder:', prompt);
    }
    
    // Encode the prompt for URL
    const encodedPrompt = encodeURIComponent(prompt);
    
    // Start building the URL
    let url = `https://text.pollinations.ai/${encodedPrompt}`;
    
    // Add query parameters
    const queryParams = [];
    
    if (parameters.model) queryParams.push(`model=${encodeURIComponent(parameters.model)}`);
    if (parameters.seed) queryParams.push(`seed=${encodeURIComponent(parameters.seed)}`);
    if (parameters.temperature && parameters.temperature !== 0.7) queryParams.push(`temperature=${encodeURIComponent(parameters.temperature.toString())}`);
    if (parameters.max_tokens && parameters.max_tokens !== 1000) queryParams.push(`max_tokens=${encodeURIComponent(parameters.max_tokens.toString())}`);
    
    // Add system message if present
    const systemMessage = parameters.messages.find(msg => msg?.role === 'system');
    if (systemMessage?.content) {
      queryParams.push(`system=${encodeURIComponent(systemMessage.content)}`);
    }
    
    // Add json parameter for consistent JSON response
    queryParams.push('json=true');
    
    // Add private parameter if needed
    if (parameters.private) queryParams.push('private=true');
    
    // Add referrer if available
    if (parameters.referrer) queryParams.push(`referrer=${encodeURIComponent(parameters.referrer)}`);
    
    // Append query parameters to URL if any exist
    if (queryParams.length > 0) {
      url += '?' + queryParams.join('&');
    }
    
    return url;
  };

  // Generate text via API (now using GET)
  const updateText = useCallback(async (parameters) => {
    // Skip if no parameters or already loading
    if (!parameters || isLoading) return;
    
    // Debug log parameters to verify what's being passed
    console.log('updateText called with parameters:', parameters);
    console.log('User message:', parameters.messages?.find(msg => msg?.role === 'user')?.content);
    
    setIsLoading(true);
    
    // Stop the feed while generating
    if (stop) stop(true);
    
    try {
      // Create GET URL from parameters
      const url = createGetUrl(parameters);
      
      if (!url) {
        throw new Error('Invalid parameters: missing prompt or messages');
      }
      
      // Determine if we're in local development
      const isLocalDev = window.location.hostname === 'localhost' || 
                          window.location.hostname === '127.0.0.1';

      // Create the fetch URL - use a CORS proxy in development if needed
      let fetchUrl = url;
      
      if (isLocalDev) {
        // Log the original URL for debugging
        console.log('Original URL:', url);
        
        // Option 1: Use a public CORS proxy (for development only)
        fetchUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
        
        // Option 2: Alternative CORS proxy if the above doesn't work
        // fetchUrl = `https://cors-anywhere.herokuapp.com/${url}`;
        
        console.log('Using CORS proxy:', fetchUrl);
      }
      
      console.log('Fetching from URL:', fetchUrl);
      
      // Make GET request with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      // Make GET request
      const response = await fetch(fetchUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json, text/plain',
        },
        signal: controller.signal,
        // Add some standard fetch options to help browsers
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'follow',
        mode: 'cors'
      });
      
      // Clear the timeout
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, message: ${errorText || 'No error details'}`);
      }
      
      // Parse the response
      let responseText;
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const jsonResponse = await response.json();
        responseText = jsonResponse;
      } else {
        responseText = await response.text();
      }
      
      // Create entry from API response
      const newEntry = {
        response: typeof responseText === 'object' ? JSON.stringify(responseText) : responseText,
        referrer: 'pollinations.ai', // Default referrer
        parameters: {
          ...parameters,
          type: "chat",
          method: "GET", // Mark that this was a GET request
          url: url // Store the URL for debugging
        }
      };
      
      // Mark that we've generated our own entry
      hasGeneratedEntry.current = true;
      setCurrentEntry(newEntry);
    } catch (error) {
      console.warn("Error generating text:", error.message);
      
      // If it's a fetch error, also log the URL for debugging
      if (error.message && error.message.includes('fetch')) {
        console.warn("URL that failed:", createGetUrl(parameters));
      }
      
      // Set a fallback entry with error message
      const errorEntry = {
        response: `Error: ${error.message}. Please try again.`,
        referrer: 'pollinations.ai',
        parameters: {
          ...parameters,
          type: "chat",
          method: "GET",
          error: error.message
        }
      };
      
      hasGeneratedEntry.current = true;
      setCurrentEntry(errorEntry);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, stop]);

  // Cancel generation
  const cancelGeneration = useCallback(() => {
    setIsLoading(false);
  }, []);

  return { 
    updateText,
    cancelGeneration,
    isLoading,
    entry: currentEntry
  };
}; 