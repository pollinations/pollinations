import { useState, useCallback, useRef, useEffect } from "react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string | Record<string, any>;
}

interface UsePollinationsChatOptions {
  seed?: number;
  jsonMode?: boolean;
  model?: string;
  apiKey: string;
}

interface UsePollinationsChatReturn {
  sendMessage: (message: string) => Promise<void>;
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  reset: () => void;
}

/**
 * React hook for multi-turn chat with Pollinations API
 * @param initMessages - Initial messages array
 * @param options - Configuration options including API key
 * @returns Object with sendMessage, messages, isLoading, error, and reset function
 */
const usePollinationsChat = (
  initMessages: ChatMessage[] = [],
  options: UsePollinationsChatOptions
): UsePollinationsChatReturn => {
  const { seed = 42, jsonMode = false, model = "openai", apiKey } = options;

  const [messages, setMessages] = useState<ChatMessage[]>(initMessages);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialMessagesRef = useRef(initMessages);

  useEffect(() => {
    initialMessagesRef.current = initMessages;
  }, [initMessages]);

  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (userMessage: string) => {
      if (!userMessage || userMessage.trim() === "") return;

      if (typeof seed !== "number" || seed < 0 || seed > 4294967295) {
        setError(
          "Seed must be a 32-bit unsigned integer (0-4294967295)"
        );
        return;
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      const updatedMessages = [
        ...messages,
        { role: "user" as const, content: userMessage },
      ];
      setMessages(updatedMessages);
      setIsLoading(true);
      setError(null);

      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };

        if (!apiKey) {
          throw new Error("API key is required");
        }

        if (!/^(pk_|sk_)/.test(apiKey)) {
          console.warn("API key format may be invalid");
        }

        headers["Authorization"] = `Bearer ${apiKey}`;

        const response = await fetch(
          `https://gen.pollinations.ai/v1/chat/completions`,
          {
            method: "POST",
            headers,
            body: JSON.stringify({
              messages: updatedMessages,
              jsonMode,
              seed,
              model,
            }),
            signal: abortControllerRef.current.signal,
          }
        );

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.text();
        let assistantMessage: string | Record<string, any> = data;
        if (jsonMode) {
          try {
            assistantMessage = JSON.parse(data);
          } catch (parseErr) {
            throw new Error(
              `Failed to parse JSON response: ${parseErr instanceof Error ? parseErr.message : "Unknown error"}`
            );
          }
        }

        setMessages((prevMessages) => [
          ...prevMessages,
          { role: "assistant", content: assistantMessage },
        ]);
        setIsLoading(false);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        console.error("Error in usePollinationsChat:", err);
        setError(err instanceof Error ? err.message : "Unknown error");
        setIsLoading(false);
      }
    },
    [messages, seed, jsonMode, model, apiKey]
  );

  const reset = useCallback(() => {
    setMessages(initialMessagesRef.current);
    setError(null);
    setIsLoading(false);
  }, []);

  return { sendMessage, messages, isLoading, error, reset };
};

export default usePollinationsChat;
