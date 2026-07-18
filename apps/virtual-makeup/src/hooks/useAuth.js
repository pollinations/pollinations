import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "pollinations_api_key";
const ENTER_URL = "https://enter.pollinations.ai";

const credentialStore = {
    get: () => sessionStorage.getItem(STORAGE_KEY),
    set: (v) => sessionStorage.setItem(STORAGE_KEY, v),
    remove: () => sessionStorage.removeItem(STORAGE_KEY),
};

/** Validates Pollinations API key format */
const isValidApiKey = (token) =>
    typeof token === "string" && /^(sk_|plln_pk_|pk_)/.test(token);

/**
 * BYOP authentication hook.
 * Manages the /authorize redirect flow with enter.pollinations.ai.
 *
 * @param {Object} [options]
 * @param {string} [options.appKey] - Publishable key for app attribution on consent screen
 */
export function useAuth({ appKey } = {}) {
    const [apiKey, setApiKey] = useState(() => {
        if (typeof window === "undefined") return null;
        return credentialStore.get();
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
                credentialStore.set(key);
                setApiKey(key);
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
        let authUrl = `${ENTER_URL}/authorize?redirect_url=${encodeURIComponent(currentUrl)}`;
        if (appKey) authUrl += `&app_key=${encodeURIComponent(appKey)}`;
        window.location.href = authUrl;
    }, [appKey]);

    const logout = useCallback(() => {
        credentialStore.remove();
        setApiKey(null);
    }, []);

    return {
        apiKey,
        isLoggedIn: !!apiKey,
        login,
        logout,
    };
}
