import { useState, useEffect, useCallback } from "react";
import { useInterval } from "usehooks-ts";

/**
 * Hook to connect to the text SSE feed with throttled display
 */
export const useTextSlideshow = (mode) => {
    const [entry, setEntry] = useState(null);
    const [isStopped, setIsStopped] = useState(false);
    const [error, setError] = useState(null);
    const [connectionStatus, setConnectionStatus] = useState("disconnected");
    const [pendingEntries, setPendingEntries] = useState([]);

    // Normalize response data
    const processEntry = useCallback((data) => {
        if (!data) return data;

        // Convert object response to string if needed
        const response =
            typeof data.response === "object"
                ? JSON.stringify(data.response)
                : data.response || "No response data provided";

        return {
            ...data,
            response,
            parameters: data.parameters || {},
            referrer: data.referrer || "https://pollinations.ai",
            concurrentRequests:
                data.concurrentRequests || Math.floor(Math.random() * 3) + 1, // Add concurrentRequests with fallback to random value
        };
    }, []);

    // Add new entry to the queue - filter for GET requests only
    const onNewEntry = useCallback(
        (newEntry) => {
            if (newEntry && typeof newEntry === "object") {
                // Check if this entry is from a GET request using multiple indicators
                // Any of these conditions would indicate a GET request
                const isGetRequest =
                    // Explicitly marked as GET
                    newEntry.parameters?.method === "GET" ||
                    // No method specified, and no indication of a POST request (chat completion)
                    (!newEntry.parameters?.method &&
                        !newEntry.parameters?.type?.includes("chat")) ||
                    // Has a request_url which would typically only exist for GET requests
                    !!newEntry.parameters?.request_url ||
                    // No parameters.messages array (which would indicate a POST/chat request)
                    !newEntry.parameters?.messages;

                if (isGetRequest) {
                    const processedEntry = processEntry(newEntry);
                    setPendingEntries((entries) => [
                        ...entries,
                        processedEntry,
                    ]);

                    // Always dispatch custom event for counter increment, regardless of stopped state
                    window.dispatchEvent(
                        new CustomEvent("text-entry-received", {
                            detail: { entry: processedEntry },
                        }),
                    );
                } else {
                    console.log(
                        "Skipping non-GET entry:",
                        newEntry.parameters?.method,
                        newEntry.parameters?.type,
                        newEntry.parameters?.messages
                            ? "has messages"
                            : "no messages",
                    );
                }
            }
        },
        [processEntry],
    );

    // Set up SSE connection
    useEffect(() => {
        let eventSource = null;
        let retryTimeout = null;
        let retryCount = 0;
        const MAX_RETRY_TIME = 30000; // 30 seconds

        const connectToSSE = () => {
            // Clean up any existing connection
            if (eventSource) {
                eventSource.close();
                eventSource = null;
            }
            // Clear pending retries
            if (retryTimeout) {
                clearTimeout(retryTimeout);
                retryTimeout = null;
            }

            // Only proceed if mode is 'text'
            if (mode !== "text") {
                setConnectionStatus("disconnected");
                return;
            }

            setConnectionStatus("connecting");
            retryCount = 0; // Reset retry count on successful connection attempt start

            try {
                eventSource = new EventSource(
                    "https://text.pollinations.ai/feed",
                    {
                        withCredentials: false,
                    },
                );

                eventSource.onmessage = (event) => {
                    try {
                        if (!event.data) return;

                        const data = JSON.parse(event.data);
                        if (data && typeof data === "object") {
                            onNewEntry(data);
                            setError(null);
                            setConnectionStatus("receiving-data");
                            retryCount = 0;
                        }
                    } catch (error) {
                        console.warn("Error processing message:", error);
                    }
                };

                eventSource.onopen = () => {
                    setConnectionStatus("connected");
                    setError(null);
                    retryCount = 0; // Reset retries on successful open
                };

                eventSource.onerror = () => {
                    if (retryTimeout) clearTimeout(retryTimeout); // Clear previous retry timeout

                    setConnectionStatus("error");
                    setError("Connection failed. Reconnecting...");

                    if (eventSource) {
                        eventSource.close();
                        eventSource = null;
                    }

                    // Only retry if the mode is still 'text'
                    if (mode === "text") {
                        const backoffTime = Math.min(
                            1000 * Math.pow(2, retryCount),
                            MAX_RETRY_TIME,
                        );
                        retryCount++;
                        retryTimeout = setTimeout(connectToSSE, backoffTime);
                    } else {
                        setConnectionStatus("disconnected");
                    }

                    console.warn("Text feed EventSource error.");
                };
            } catch (error) {
                console.error("Failed to create text EventSource:", error);
                setConnectionStatus("error");
                setError("Failed to create connection");

                // Only retry if the mode is still 'text'
                if (mode === "text") {
                    const backoffTime = Math.min(
                        1000 * Math.pow(2, retryCount),
                        MAX_RETRY_TIME,
                    );
                    retryCount++;
                    retryTimeout = setTimeout(connectToSSE, backoffTime);
                } else {
                    setConnectionStatus("disconnected");
                }
            }
        };

        // Initial connection attempt or when mode changes to 'text'
        connectToSSE();

        // Clean up: close connection and clear timeouts
        return () => {
            if (eventSource) {
                eventSource.close();
                eventSource = null;
            }
            if (retryTimeout) {
                clearTimeout(retryTimeout);
                retryTimeout = null;
            }
            setConnectionStatus("disconnected"); // Set status on cleanup
        };
    }, [mode, onNewEntry]); // Add mode to dependency array

    // Process pending entries at a fixed interval
    const DISPLAY_INTERVAL = 1000; // 1 second between entries
    useInterval(() => {
        if (pendingEntries.length > 0 && !isStopped) {
            // Take the first entry from the queue
            const nextEntry = pendingEntries[0];
            // Remove it from the queue
            setPendingEntries((entries) => entries.slice(1));
            // Set as current entry
            setEntry(nextEntry);
        }
    }, DISPLAY_INTERVAL);

    return {
        entry,
        error,
        connectionStatus,
        stop: (stopState) =>
            setIsStopped(stopState !== undefined ? stopState : (prev) => !prev),
        isStopped,
        pendingCount: pendingEntries.length,
        onNewEntry,
    };
};
