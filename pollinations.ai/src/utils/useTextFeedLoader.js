import { useEffect, useState } from 'react';

/**
 * Simplified hook to track text entries counter and load initial entry
 */
export function useTextFeedLoader(onNewEntry, setLastEntry) {
  // Start with estimated value and increment with each new entry
  const [entriesGenerated, setEntriesGenerated] = useState(estimateGeneratedEntries());
  
  // Set up listener to increment counter when new entries are received
  useEffect(() => {
    // Create wrapper function that increments the counter
    const incrementCounter = () => {
      setEntriesGenerated(count => count + 1);
    };
    
    // Listen for SSE data events
    window.addEventListener('text-entry-received', incrementCounter);
    
    return () => {
      window.removeEventListener('text-entry-received', incrementCounter);
    };
  }, []);
  
  // Fetch the last entry on mount (initial load only)
  useEffect(() => {
    let isMounted = true;
    
    const fetchLastEntry = async () => {
      try {
        // Use AbortController for timeout handling
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch('https://text.pollinations.ai/last', {
          cache: 'no-store',
          headers: { 'Accept': 'application/json' },
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok && isMounted) {
          const contentType = response.headers.get('content-type');
          
          if (contentType?.includes('application/json')) {
            try {
              const data = await response.json();
              
              // Ensure required properties exist
              const processedData = {
                ...data,
                referrer: data.referrer || 'https://pollinations.ai',
                concurrentRequests: data.concurrentRequests || Math.floor(Math.random() * 3) + 1 // Add concurrentRequests property with fallback to random value between 1-3
              };
              
              setLastEntry(processedData);
              onNewEntry(processedData);
            } catch (parseError) {
              console.warn("Error parsing JSON response:", parseError.message);
            }
          }
        } else if (isMounted) {
          console.warn(`Error fetching last entry: ${response.status} ${response.statusText}`);
        }
      } catch (error) {
        if (isMounted) {
          const errorMessage = error.name === 'AbortError' 
            ? "Initial fetch request timed out" 
            : `Error fetching initial entry: ${error.message}`;
          console.warn(errorMessage);
        }
      }
    };

    fetchLastEntry();
    
    return () => { isMounted = false; };
  }, [onNewEntry, setLastEntry]);

  return { entriesGenerated };
}

/**
 * Estimate the number of text entries generated based on time elapsed
 * Used as a starting point, will be incremented with each new entry
 */
function estimateGeneratedEntries() {
  const launchDate = 1738974161902; // Same as image feed for consistency
  const now = Date.now();
  const differenceInSeconds = (now - launchDate) / 1000;
  // Assuming text generation rate is about 1/5 of the image rate
  const entriesGeneratedSinceLaunch = Math.round(differenceInSeconds * 4.76); 
  
  // Starting value plus calculated growth
  return 23554400 + entriesGeneratedSinceLaunch;
} 