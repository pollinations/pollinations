import { useState, useEffect, useRef } from "react";

interface UsePollinationsModelsOptions {
  apiKey?: string;
}

interface UsePollinationsModelsReturn {
  models: Array<Record<string, any>>;
  isLoading: boolean;
  error: string | null;
}

/**
 * React hook for fetching available models from Pollinations API
 * @param type - Type of models to fetch ("text" or "image")
 * @param options - Configuration options including optional API key
 * @returns Object with models array, isLoading, and error
 */
const usePollinationsModels = (
  type: "text" | "image" = "text",
  options: UsePollinationsModelsOptions = {}
): UsePollinationsModelsReturn => {
  const { apiKey } = options;

  const [models, setModels] = useState<Array<Record<string, any>>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const fetchModels = async () => {
      if (apiKey && !/^(pk_|sk_)/.test(apiKey)) {
        console.warn("API key format may be invalid");
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      setIsLoading(true);
      setError(null);

      try {
        const headers: Record<string, string> = {};
        if (apiKey) {
          headers["Authorization"] = `Bearer ${apiKey}`;
        }

        const endpoint =
          type === "image"
            ? "https://gen.pollinations.ai/image/models"
            : "https://gen.pollinations.ai/text/models";
        const response = await fetch(endpoint, {
          headers,
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        setModels(Array.isArray(data) ? data : []);
        setIsLoading(false);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
        console.error("Error fetching models:", err);
        setError(err instanceof Error ? err.message : "Unknown error");
        setIsLoading(false);
      }
    };

    fetchModels();
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [type, apiKey]);

  return { models, isLoading, error };
};

export default usePollinationsModels;
