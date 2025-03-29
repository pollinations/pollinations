import { useState, useEffect, useRef } from 'react';

/**
 * Hook for text editor functionality
 */
export const useTextEditor = ({ stop, entry }) => {
  const [currentEntry, setCurrentEntry] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  // Add flag to track if we've generated our own entry via API
  const hasGeneratedEntry = useRef(false);

  useEffect(() => {
    // Only update from parent entry if we haven't generated our own OR if the parent entry is completely new
    if (entry && 
        ((!hasGeneratedEntry.current && (!currentEntry || entry !== currentEntry)) || 
         (hasGeneratedEntry.current && !currentEntry))) {
      setCurrentEntry(entry);
    }
  }, [entry, currentEntry]);

  const updateText = async (parameters) => {
    setIsLoading(true);
    stop(true);
    
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
      const generatedText = result.choices[0].message.content;
      
      const newEntry = {
        response: generatedText,
        // Use referrer from API response if available
        referrer: result.referrer || 'unknown',
        parameters: {
          model: parameters.model,
          messages: parameters.messages,
          seed: parameters.seed,
          type: "chat"
        }
      };
      
      // Mark that we've generated our own entry to prevent overwriting
      hasGeneratedEntry.current = true;
      setCurrentEntry(newEntry);
    } catch (error) {
      // Silently handle errors
    } finally {
      setIsLoading(false);
    }
  };

  const cancelGeneration = () => {
    setIsLoading(false);
  };

  return { 
    updateText,
    cancelGeneration,
    isLoading,
    entry: currentEntry
  };
}; 