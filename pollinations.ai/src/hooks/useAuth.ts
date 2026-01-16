import { useCallback, useEffect, useState } from "react";
import { DEFAULT_API_KEY } from "../api.config";

const STORAGE_KEY = "pollinations_api_key";
const ENTER_URL = "https://enter.pollinations.ai";
const ACCOUNT_API_BASE = "https://enter.pollinations.ai/api";

interface UserProfile {
    name: string;
    email: string;
    githubUsername: string | null;
}

interface UserBalance {
    balance: number;
}

interface UseAuthReturn {
    apiKey: string;
    isLoggedIn: boolean;
    profile: UserProfile | null;
    balance: UserBalance | null;
    isLoadingProfile: boolean;
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
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [balance, setBalance] = useState<UserBalance | null>(null);
    const [isLoadingProfile, setIsLoadingProfile] = useState(false);

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

    // Fetch profile when logged in (gracefully fails if no permission)
    useEffect(() => {
        if (!userApiKey) {
            setProfile(null);
            return;
        }

        const fetchProfile = async () => {
            setIsLoadingProfile(true);
            try {
                const response = await fetch(
                    `${ACCOUNT_API_BASE}/account/profile`,
                    {
                        headers: {
                            Authorization: `Bearer ${userApiKey}`,
                        },
                    },
                );

                if (response.ok) {
                    const data = await response.json();
                    setProfile({
                        name: data.name,
                        email: data.email,
                        githubUsername: data.githubUsername,
                    });
                } else if (response.status === 401) {
                    // Invalid/expired key - clear it
                    console.warn("[useAuth] API key invalid or expired");
                    localStorage.removeItem(STORAGE_KEY);
                    setUserApiKey(null);
                    setProfile(null);
                } else {
                    // 403 = no permission, log for debugging
                    console.debug(
                        "[useAuth] Profile fetch failed:",
                        response.status,
                    );
                    setProfile(null);
                }
            } catch (err) {
                console.warn("[useAuth] Profile fetch error:", err);
                setProfile(null);
            } finally {
                setIsLoadingProfile(false);
            }
        };

        fetchProfile();

        // Fetch balance (separate permission, gracefully fails)
        const fetchBalance = async () => {
            try {
                const response = await fetch(
                    `${ACCOUNT_API_BASE}/account/balance`,
                    {
                        headers: {
                            Authorization: `Bearer ${userApiKey}`,
                        },
                    },
                );

                if (response.ok) {
                    const data = await response.json();
                    setBalance({
                        balance: data.balance,
                    });
                } else {
                    console.debug(
                        "[useAuth] Balance fetch failed:",
                        response.status,
                    );
                    setBalance(null);
                }
            } catch (err) {
                console.warn("[useAuth] Balance fetch error:", err);
                setBalance(null);
            }
        };

        fetchBalance();
    }, [userApiKey]);

    const login = useCallback(() => {
        const currentUrl = window.location.href.split("#")[0];
        const authUrl = `${ENTER_URL}/authorize?redirect_url=${encodeURIComponent(currentUrl)}&permissions=profile,balance`;
        window.location.href = authUrl;
    }, []);

    const logout = useCallback(() => {
        localStorage.removeItem(STORAGE_KEY);
        setUserApiKey(null);
        setProfile(null);
        setBalance(null);
    }, []);

    return {
        apiKey: userApiKey || DEFAULT_API_KEY,
        isLoggedIn: !!userApiKey,
        profile,
        balance,
        isLoadingProfile,
        login,
        logout,
    };
}
