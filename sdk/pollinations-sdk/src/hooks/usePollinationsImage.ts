import { useState, useEffect, useRef, useCallback } from "react";

interface UsePollinationsImageOptions {
  width?: number;
  height?: number;
  model?: string;
  seed?: number;
  nologo?: boolean;
  enhance?: boolean;
  apiKey: string;
}

interface UsePollinationsImageReturn {
  data: string | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * React hook for generating images using Pollinations API
 * @param prompt - The image generation prompt
 * @param options - Configuration options including API key
 * @returns Object with data (blob URL), isLoading, error, and refetch function
 */
const usePollinationsImage = (
  prompt: string,
  options: UsePollinationsImageOptions
): UsePollinationsImageReturn => {
  const {
    width = 1024,
    height = 1024,
    model = "flux",
    seed = 42,
    nologo = true,
    enhance = false,
    apiKey,
  } = options;

  const [data, setData] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  const fetchImage = useCallback(async () => {
    if (!prompt) return;

    if (width < 64 || width > 2048 || height < 64 || height > 2048) {
      setError("Width and height must be between 64 and 2048");
      return;
    }

    if (typeof seed !== "number" || seed < 0 || seed > 4294967295) {
      setError("Seed must be a 32-bit unsigned integer (0-4294967295)");
      return;
    }

    if (!apiKey) {
      setError("API key is required");
      return;
    }

    if (!/^(pk_|sk_)/.test(apiKey)) {
      console.warn("API key format may be invalid");
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set("width", width.toString());
      params.set("height", height.toString());
      params.set("seed", seed.toString());
      params.set("model", model);
      if (nologo) params.set("nologo", "true");
      if (enhance) params.set("enhance", "true");

      const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      };

      const response = await fetch(
        `https://gen.pollinations.ai/image/${encodeURIComponent(prompt)}?${params.toString()}`,
        { headers, signal: abortControllerRef.current.signal }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
      }
      const blob = await response.blob();
      const imageUrl = URL.createObjectURL(blob);
      blobUrlRef.current = imageUrl;
      setData(imageUrl);
      setIsLoading(false);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      console.error("Error in usePollinationsImage:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
      setIsLoading(false);
    }
  }, [prompt, width, height, model, seed, nologo, enhance, apiKey]);

  useEffect(() => {
    fetchImage();
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
      }
    };
  }, [fetchImage]);

  return { data, isLoading, error, refetch: fetchImage };
};

export default usePollinationsImage;
