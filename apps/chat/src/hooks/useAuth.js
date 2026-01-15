import { useState, useEffect, useCallback } from "react";
import { STORAGE_KEY, ENTER_URL, DEFAULT_API_KEY, isValidApiKey } from "../config/auth";
import { fetchPollenBalance } from "../utils/api";

/**
 * Hook for managing BYOP (Bring Your Own Pollen) authentication
 * - Stores user's API key in localStorage
 * - Provides login/logout functions
 * - Returns current API key (user's or default)
 * - Fetches and returns pollen balance for logged-in users
 */
export function useAuth() {
    const [userApiKey, setUserApiKey] = useState(() => {
        if (typeof window === "undefined") return null;
        return localStorage.getItem(STORAGE_KEY);
    });

    const [pollenBalance, setPollenBalance] = useState(null);
    const [isLoadingBalance, setIsLoadingBalance] = useState(false);

    // Check URL fragment for API key on mount (redirect from enter.pollinations.ai)
    useEffect(() => {
        if (typeof window === "undefined") return;

        const hash = window.location.hash.substring(1);
        if (!hash) return;

        try {
            const hashParams = new URLSearchParams(hash);
            const key = hashParams.get("api_key");

            if (key) {
                // Validate key format before storing
                if (isValidApiKey(key)) {
                    localStorage.setItem(STORAGE_KEY, key);
                    setUserApiKey(key);
                    // Clean URL - remove fragment
                    window.history.replaceState(
                        {},
                        "",
                        window.location.pathname + window.location.search,
                    );
                } else {
                    console.error('Invalid API key format in URL fragment. Expected key to start with sk_, plln_pk_, or pk_');
                }
            }
        } catch (error) {
            console.error('Error parsing URL fragment for API key:', error);
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
        setPollenBalance(null);
    }, []);

    // Fetch balance when user logs in
    useEffect(() => {
        if (!userApiKey) {
            setPollenBalance(null);
            return;
        }

        const loadBalance = async () => {
            setIsLoadingBalance(true);
            const balance = await fetchPollenBalance(userApiKey);
            setPollenBalance(balance);
            setIsLoadingBalance(false);
        };

        loadBalance();
    }, [userApiKey]);

    return {
        apiKey: userApiKey || DEFAULT_API_KEY,
        isLoggedIn: !!userApiKey,
        pollenBalance,
        isLoadingBalance,
        login,
        logout,
    };
}
