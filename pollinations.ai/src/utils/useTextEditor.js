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

  // Generate text via API
  const updateText = useCallback(async (parameters) => {
    // Skip if no parameters or already loading
    if (!parameters || isLoading) return;
    
    setIsLoading(true);
    
    // Stop the feed while generating
    if (stop) stop(true);
    
    try {
      const response = await fetch('https://text.pollinations.ai/openai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(parameters),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      
      // Create entry from API response
      const newEntry = {
        response: result.choices[0].message.content,
        referrer: result.referrer || 'unknown',
        parameters: {
          ...parameters,
          type: "chat"
        }
      };
      
      // Mark that we've generated our own entry
      hasGeneratedEntry.current = true;
      setCurrentEntry(newEntry);
    } catch (error) {
      console.warn("Error generating text:", error.message);
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