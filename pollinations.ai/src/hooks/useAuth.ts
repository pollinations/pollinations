import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "pollinations_api_key";
const DEFAULT_API_KEY = "pk_WQYvjz9SpSpAcJdR";
const ENTER_URL = "https://enter.pollinations.ai";

interface UseAuthReturn {
    apiKey: string;
    isLoggedIn: boolean;
    login: () => void;
    logout: () => void;
}

/**
 * Hook for managing authentication state
 * - Stores user's API key in localStorage
 * - Provides login/logout functions
 * - Returns current API key (user's or default)
 */
export function useAuth(): UseAuthReturn {
    const [userApiKey, setUserApiKey] = useState<string | null>(() => {
        if (typeof window === "undefined") return null;
        return localStorage.getItem(STORAGE_KEY);
    });

    // Check URL fragment for API key on mount (redirect from enter.pollinations.ai)
    useEffect(() => {
        if (typeof window === "undefined") return;

        const hash = window.location.hash.substring(1);
        if (!hash) return;

        const hashParams = new URLSearchParams(hash);
        const key = hashParams.get("api_key");

        if (key) {
            localStorage.setItem(STORAGE_KEY, key);
            setUserApiKey(key);
            // Clean URL - remove fragment
            window.history.replaceState(
                {},
                "",
                window.location.pathname + window.location.search,
            );
        }
    }, []);

    const login = useCallback(() => {
        const currentUrl = window.location.href.split("#")[0];
        const authUrl = `${ENTER_URL}/authorize?redirect_url=${encodeURIComponent(currentUrl)}`;
        window.location.href = authUrl;
    }, []);

    const logout = useCallback(() => {
        localStorage.removeItem(STORAGE_KEY);
        setUserApiKey(null);
    }, []);

    return {
        apiKey: userApiKey || DEFAULT_API_KEY,
        isLoggedIn: !!userApiKey,
        login,
        logout,
    };
}
