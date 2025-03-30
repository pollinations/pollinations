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
    
    // Add query parameters - only include model, force json=false
    const queryParams = [];
    
    // Only keep model parameter
    if (parameters.model) queryParams.push(`model=${encodeURIComponent(parameters.model)}`);
    
    // Force json=false
    queryParams.push('json=false');
    
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
      
      // No CORS proxy - use direct URL for all environments
      console.log('Fetching from URL:', url);
      
      // Make GET request with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      // Make GET request
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'text/plain, application/json',
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
      
      // Parse the response - since we're forcing json=false, we'll always get plain text
      const responseText = await response.text();
      
      // Create entry from API response
      const newEntry = {
        response: responseText,
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
        console.warn("URL that failed:", url);
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