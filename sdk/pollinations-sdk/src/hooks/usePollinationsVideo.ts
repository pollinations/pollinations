import { useState, useEffect, useRef, useCallback } from "react";

interface UsePollinationsVideoOptions {
  model?: string;
  duration?: number;
  aspectRatio?: string;
  seed?: number;
  audio?: boolean;
  nologo?: boolean;
  safe?: boolean;
  apiKey: string;
}

interface UsePollinationsVideoReturn {
  data: string | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * React hook for generating videos using Pollinations API
 * @param prompt - The video generation prompt
 * @param options - Configuration options including API key
 * @returns Object with data (blob URL), isLoading, error, and refetch function
 */
const usePollinationsVideo = (
  prompt: string,
  options: UsePollinationsVideoOptions
): UsePollinationsVideoReturn => {
  const {
    model = "veo",
    duration = 4,
    aspectRatio = "16:9",
    seed = 42,
    audio = false,
    nologo = true,
    safe = false,
    apiKey,
  } = options;

  const [data, setData] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  const validateParams = useCallback(() => {
    const validModels = ["veo", "seedance", "seedance-pro"];
    if (!validModels.includes(model)) {
      return `Invalid model. Supported models: ${validModels.join(", ")}`;
    }

    if (typeof duration !== "number" || duration < 1 || duration > 10) {
      return "Duration must be an integer between 1 and 10 seconds";
    }

    if (model === "veo") {
      if (![4, 6, 8].includes(duration)) {
        return "For 'veo' model, duration must be 4, 6, or 8 seconds";
      }
    } else if (model === "seedance" || model === "seedance-pro") {
      if (duration < 2 || duration > 10) {
        return `For '${model}' model, duration must be between 2 and 10 seconds`;
      }
    }

    const validAspectRatios = ["16:9", "9:16"];
    if (!validAspectRatios.includes(aspectRatio)) {
      return `Invalid aspect ratio. Supported: ${validAspectRatios.join(", ")}`;
    }

    return null;
  }, [model, duration, aspectRatio]);

  const fetchVideo = useCallback(async () => {
    if (!prompt) return;

    const paramsError = validateParams();
    if (paramsError) {
      setError(paramsError);
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
      params.set("model", model);
      params.set("duration", duration.toString());
      params.set("aspectRatio", aspectRatio);
      params.set("seed", seed.toString());
      if (audio && model === "veo") params.set("audio", "true");
      if (nologo) params.set("nologo", "true");
      if (safe) params.set("safe", "true");

      const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      };

      const response = await fetch(
        `https://gen.pollinations.ai/video/${encodeURIComponent(prompt)}?${params.toString()}`,
        { headers, signal: abortControllerRef.current.signal }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
      }
      const blob = await response.blob();
      const videoUrl = URL.createObjectURL(blob);
      blobUrlRef.current = videoUrl;
      setData(videoUrl);
      setIsLoading(false);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      console.error("Error in usePollinationsVideo:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
      setIsLoading(false);
    }
  }, [prompt, model, duration, aspectRatio, seed, audio, nologo, safe, apiKey, validateParams]);

  useEffect(() => {
    fetchVideo();
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
      }
    };
  }, [fetchVideo]);

  return { data, isLoading, error, refetch: fetchVideo };
};

export default usePollinationsVideo;
