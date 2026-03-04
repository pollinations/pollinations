import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "pollinations_api_key";
const ENTER_URL = "https://enter.pollinations.ai";
const APP_KEY = "pk_eEwhBUcGgIODbazu";

/** Validates Pollinations API key format */
const isValidApiKey = (token: string): boolean =>
  typeof token === "string" && /^(sk_|plln_pk_|pk_)/.test(token);

/**
 * BYOP authentication hook for AI Dungeon Master.
 * Manages the /authorize redirect flow with enter.pollinations.ai.
 */
export function useAuth() {
  const [apiKey, setApiKey] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(STORAGE_KEY);
  });

  // On mount: parse #api_key=... from URL fragment (redirect callback)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const hash = window.location.hash.substring(1);
    if (!hash) return;

    try {
      const params = new URLSearchParams(hash);
      const key = params.get("api_key");

      if (key && isValidApiKey(key)) {
        localStorage.setItem(STORAGE_KEY, key);
        setApiKey(key);
        // Clean the fragment from the URL
        window.history.replaceState(
          {},
          "",
          window.location.pathname + window.location.search,
        );
      } else if (key) {
        console.error(
          "Invalid API key format in URL fragment. Expected sk_, plln_pk_, or pk_ prefix.",
        );
      }
    } catch (error) {
      console.error("Error parsing URL fragment for API key:", error);
    }
  }, []);

  const login = useCallback(() => {
    const currentUrl = window.location.href.split("#")[0];
    const authUrl = `${ENTER_URL}/authorize?redirect_url=${encodeURIComponent(currentUrl)}&app_key=${APP_KEY}&permissions=profile,balance`;
    window.location.href = authUrl;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setApiKey(null);
  }, []);

  return {
    apiKey,
    isLoggedIn: !!apiKey,
    login,
    logout,
  };
}
