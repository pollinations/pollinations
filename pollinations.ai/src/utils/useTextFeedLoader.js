import { useEffect, useState } from 'react';

/**
 * Hook to track and count text entries generated
 */
export function useTextFeedLoader(onNewEntry, setLastEntry) {
  const [entriesGenerated, setEntriesGenerated] = useState(estimateGeneratedEntries());
  const [currentLoad, setCurrentLoad] = useState(Math.floor(Math.random() * 4) + 1);

  // Fetch the last entry on mount
  useEffect(() => {
    const fetchLastEntry = async () => {
      try {
        const response = await fetch('https://text.pollinations.ai/last', {
          cache: 'no-store',
          headers: {
            'Accept': 'application/json'
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          
          // Add concurrentRequests if missing
          if (!data.concurrentRequests) {
            data.concurrentRequests = currentLoad;
          }
          
          // Add referrer if missing
          if (!data.referrer) {
            data.referrer = 'https://pollinations.ai';
          }
          
          setLastEntry(data);
          onNewEntry(data);
        }
      } catch (error) {
        // Silent error handling
      }
    };

    fetchLastEntry();
  }, [onNewEntry, setLastEntry, currentLoad]);

  // Set up event source to listen for new entries and update the counter
  useEffect(() => {
    const textFeedSource = new EventSource("https://text.pollinations.ai/feed");
    
    textFeedSource.onmessage = (event) => {
      try {
        // Parse the data and add concurrentRequests if it doesn't exist
        const data = JSON.parse(event.data);
        
        // Increment the counter for each new entry - moved inside try block
        // to ensure we only increment on valid messages
        setEntriesGenerated(count => count + 1);
        
        // Update load randomly (simulating server load fluctuation)
        if (Math.random() > 0.7) { // Only change occasionally
          setCurrentLoad(prev => {
            const change = Math.random() > 0.5 ? 1 : -1;
            return Math.max(1, Math.min(5, prev + change));
          });
        }
        
        if (!data.concurrentRequests) {
          data.concurrentRequests = currentLoad;
        }
        
        // Add referrer if missing
        if (!data.referrer) {
          data.referrer = 'https://pollinations.ai';
        }
        
        setLastEntry(data);
        
        // No need to call onNewEntry here as it's already handled in useTextSlideshow
      } catch (e) {
        // Silent error handling for parsing issues
        console.error("Error processing text feed message:", e);
      }
    };
    
    textFeedSource.onerror = async () => {
      await new Promise(r => setTimeout(r, 1000));
      console.log("Text feed event source error. Retrying...");
      textFeedSource.close();
      // The EventSource will be recreated on the next render cycle
    };
    
    return () => {
      textFeedSource.close();
    };
  }, [currentLoad, setLastEntry, onNewEntry]);

  return { entriesGenerated };
}

/**
 * Estimate the number of text entries generated based on time elapsed
 */
function estimateGeneratedEntries() {
  const launchDate = 1738974161902; // Same as image feed for consistency
  const now = Date.now();
  const differenceInSeconds = (now - launchDate) / 1000;
  // Assuming text generation rate is about 1/5 of the image rate
  const entriesGeneratedSinceLaunch = Math.round(differenceInSeconds * 4.76); 
  
  // Starting value plus calculated growth
  const entriesGeneratedCalculated = 23554400 + entriesGeneratedSinceLaunch; 
  return entriesGeneratedCalculated;
} 