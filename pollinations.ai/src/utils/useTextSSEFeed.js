import { useState, useEffect } from 'react';
import { useInterval } from 'usehooks-ts';

/**
 * Hook to connect to the text SSE feed and manage text slideshow functionality
 * 
 * Note: This hook replaces and consolidates the functionality from both
 * useTextSSEFeed and useTextSlideshow. The name useTextSlideshow is kept
 * for backward compatibility across the codebase.
 */
export const useTextSlideshow = () => {
  const [entry, setEntry] = useState(null);
  const [isStopped, setIsStopped] = useState(false);
  const [error, setError] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState("disconnected");
  const [pendingEntries, setPendingEntries] = useState([]);

  useEffect(() => {
    if (isStopped) return;

    setConnectionStatus("connecting");
    
    const getEventSource = () => {
      try {
        const newEventSource = new EventSource("https://text.pollinations.ai/feed", {
          withCredentials: false
        });
        
        newEventSource.onmessage = (event) => {
          try {
            setConnectionStatus("receiving-data");
            
            if (event.data) {
              try {
                const data = JSON.parse(event.data);
                
                if (data && typeof data === 'object') {
                  if (data.response === undefined) {
                    data.response = "No response data provided";
                  }
                  
                  if (!data.parameters) {
                    data.parameters = {};
                  }
                  
                  if (!data.referrer) {
                    data.referrer = 'https://pollinations.ai';
                  }
                  
                  // Add to pending entries queue instead of setting directly
                  setPendingEntries(entries => [...entries, data]);
                  setError(null);
                } else {
                  const mockEntry = {
                    response: "Invalid data structure received",
                    referrer: 'https://pollinations.ai',
                    parameters: {
                      model: "error",
                      messages: [{
                        role: "system",
                        content: "Received data was not a valid object: " + JSON.stringify(data)
                      }]
                    }
                  };
                  setPendingEntries(entries => [...entries, mockEntry]);
                }
              } catch (parseError) {
                const mockEntry = {
                  response: `Raw event data (not valid JSON): ${event.data}`,
                  referrer: 'https://pollinations.ai',
                  parameters: {
                    model: "unknown",
                    messages: [{
                      role: "user",
                      content: "Invalid JSON data from feed"
                    }]
                  }
                };
                setPendingEntries(entries => [...entries, mockEntry]);
                setError("Warning: Received malformed data from server");
              }
            }
          } catch (error) {
            // Silent catch for error in onmessage handler
          }
        };
        
        newEventSource.onopen = () => {
          setConnectionStatus("connected");
          setError(null);
        };
        
        newEventSource.onerror = () => {
          setConnectionStatus("error");
          setError("Connection to feed server failed. Will try to reconnect...");
          newEventSource.close();
        };
        
        return newEventSource;
      } catch (connectionError) {
        setConnectionStatus("error");
        setError("Failed to initialize connection: " + connectionError.message);
        return null;
      }
    };

    let eventSource = getEventSource();

    if (eventSource) {
      eventSource.onerror = async () => {
        await new Promise(r => setTimeout(r, 1000));
        setConnectionStatus("connecting");
        eventSource.close();
        eventSource = getEventSource();
      };
    }
    
    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [isStopped]);

  // Process the next entry from pendingEntries at a fixed interval
  const interval = 1000; // 1 second between entries

  useInterval(() => {
    if (!isStopped && pendingEntries.length > 0) {
      const [nextEntry, ...remaining] = pendingEntries;
      setEntry(nextEntry);
      setPendingEntries(remaining);
    }
  }, interval);

  const stop = (value = true) => {
    setIsStopped(value);
    setConnectionStatus(value ? "disconnected" : "connecting");
  };

  const onNewEntry = (newEntry) => {
    if (!isStopped) {
      setPendingEntries(entries => [...entries, newEntry]);
    }
  };

  return { entry, onNewEntry, stop, isStopped, error, connectionStatus };
}; 