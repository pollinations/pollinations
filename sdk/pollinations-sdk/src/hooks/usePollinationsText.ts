import { useState, useEffect, useRef, useCallback } from "react";

interface UsePollinationsTextOptions {
  seed?: number;
  system?: string;
  model?: string;
  json?: boolean;
  temperature?: number;
  stream?: boolean;
  private?: boolean;
  apiKey: string;
}

interface UsePollinationsTextReturn {
  data: string | Record<string, any> | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * React hook for generating text using Pollinations API
 * @param prompt - The text generation prompt
 * @param options - Configuration options including API key
 * @returns Object with data (text or JSON), isLoading, error, and refetch function
 */
const usePollinationsText = (
  prompt: string,
  options: UsePollinationsTextOptions
): UsePollinationsTextReturn => {
  const {
    seed = 42,
    system,
    model = "openai",
    json = false,
    temperature,
    stream = false,
    private: isPrivate = false,
    apiKey,
  } = options;

  const [data, setData] = useState<string | Record<string, any> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchText = useCallback(async () => {
    if (!prompt || prompt.trim() === "") return;

    if (typeof seed !== "number" || seed < 0 || seed > 4294967295) {
      setError("Seed must be a 32-bit unsigned integer (0-4294967295)");
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setIsLoading(true);
    setError(null);

    try {
      if (!apiKey) {
        throw new Error("API key is required");
      }

      if (!/^(pk_|sk_)/.test(apiKey)) {
        console.warn("API key format may be invalid");
      }

      const params = new URLSearchParams();
      params.set("seed", seed.toString());
      params.set("model", model);
      if (json) params.set("json", "true");
      if (system) params.set("system", system);
      if (temperature !== undefined)
        params.set("temperature", temperature.toString());
      if (stream) params.set("stream", "true");
      if (isPrivate) params.set("private", "true");

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      };

      const response = await fetch(
        `https://gen.pollinations.ai/text/${encodeURIComponent(prompt)}?${params.toString()}`,
        {
          headers,
          signal: abortControllerRef.current.signal,
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const text = await response.text();
      let result: string | Record<string, any> = text;
      if (json) {
        try {
          result = JSON.parse(text);
        } catch (parseErr) {
          throw new Error(
            `Failed to parse JSON response: ${parseErr instanceof Error ? parseErr.message : "Unknown error"}`
          );
        }
      }
      setData(result);
      setIsLoading(false);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      console.error("Error in usePollinationsText:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
      setIsLoading(false);
    }
  }, [prompt, seed, model, system, json, temperature, stream, isPrivate, apiKey]);

  useEffect(() => {
    fetchText();
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchText]);

  return { data, isLoading, error, refetch: fetchText };
};

export default usePollinationsText;
