import {
    createContext,
    type ReactNode,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from "react";
import { APP_KEY, DEFAULT_API_KEY } from "../api.config";
import { fetchWithRetry } from "../utils/fetchWithRetry";

const STORAGE_KEY = "pollinations_api_key";
const ENTER_URL = "https://enter.pollinations.ai";
const ACCOUNT_API_BASE = "https://enter.pollinations.ai/api";

interface UserProfile {
    name: string;
    email: string;
    githubUsername: string | null;
    image: string | null;
    tier: "seed" | "flower" | "nectar" | null;
}

interface UserBalance {
    balance: number;
}

// Split into three contexts to minimize re-renders:
// - AuthState: apiKey + isLoggedIn (changes rarely — only on login/logout)
// - AuthProfile: profile + balance + isLoadingProfile (changes during login flow)
// - AuthActions: login + logout (stable refs, never changes)

interface AuthStateValue {
    apiKey: string;
    isLoggedIn: boolean;
}

interface AuthProfileValue {
    profile: UserProfile | null;
    balance: UserBalance | null;
    isLoadingProfile: boolean;
}

interface AuthActionsValue {
    login: () => void;
    logout: () => void;
}

// Combined type for backward compatibility
interface AuthContextValue
    extends AuthStateValue,
        AuthProfileValue,
        AuthActionsValue {}

const AuthStateContext = createContext<AuthStateValue | null>(null);
const AuthProfileContext = createContext<AuthProfileValue | null>(null);
const AuthActionsContext = createContext<AuthActionsValue | null>(null);

/**
 * Provider that holds authentication state for the entire app.
 * Wrap your app with this so all useAuth() consumers share the same state.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
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
            // Clean URL fragment without reload
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
                const response = await fetchWithRetry(
                    `${ACCOUNT_API_BASE}/account/profile`,
                    {
                        headers: {
                            Authorization: `Bearer ${userApiKey}`,
                        },
                    },
                );
                const data = await response.json();
                setProfile({
                    name: data.name,
                    email: data.email,
                    githubUsername: data.githubUsername,
                    image: data.image ?? null,
                    tier: data.tier ?? null,
                });
            } catch (err) {
                const message = err instanceof Error ? err.message : "";
                if (message.startsWith("HTTP 401")) {
                    console.warn("[useAuth] API key invalid or expired");
                    localStorage.removeItem(STORAGE_KEY);
                    setUserApiKey(null);
                } else {
                    console.debug("[useAuth] Profile fetch failed:", message);
                }
                setProfile(null);
            } finally {
                setIsLoadingProfile(false);
            }
        };

        fetchProfile();

        // Fetch balance (separate permission, gracefully fails)
        const fetchBalance = async () => {
            try {
                const response = await fetchWithRetry(
                    `${ACCOUNT_API_BASE}/account/balance`,
                    {
                        headers: {
                            Authorization: `Bearer ${userApiKey}`,
                        },
                    },
                );
                const data = await response.json();
                setBalance({ balance: data.balance });
            } catch (err) {
                console.debug(
                    "[useAuth] Balance fetch failed:",
                    err instanceof Error ? err.message : err,
                );
                setBalance(null);
            }
        };

        fetchBalance();
    }, [userApiKey]);

    const login = useCallback(() => {
        const currentUrl = window.location.href.split("#")[0];
        const authUrl = `${ENTER_URL}/authorize?redirect_url=${encodeURIComponent(currentUrl)}&app_key=${APP_KEY}&permissions=profile,balance`;
        window.location.href = authUrl;
    }, []);

    const logout = useCallback(() => {
        localStorage.removeItem(STORAGE_KEY);
        setUserApiKey(null);
        setProfile(null);
        setBalance(null);
    }, []);

    const stateValue = useMemo<AuthStateValue>(
        () => ({
            apiKey: userApiKey || DEFAULT_API_KEY,
            isLoggedIn: !!userApiKey,
        }),
        [userApiKey],
    );

    const profileValue = useMemo<AuthProfileValue>(
        () => ({ profile, balance, isLoadingProfile }),
        [profile, balance, isLoadingProfile],
    );

    const actionsValue = useMemo<AuthActionsValue>(
        () => ({ login, logout }),
        [login, logout],
    );

    return (
        <AuthActionsContext.Provider value={actionsValue}>
            <AuthStateContext.Provider value={stateValue}>
                <AuthProfileContext.Provider value={profileValue}>
                    {children}
                </AuthProfileContext.Provider>
            </AuthStateContext.Provider>
        </AuthActionsContext.Provider>
    );
}

/** Only apiKey + isLoggedIn — won't re-render on profile/balance changes */
export function useAuthState(): AuthStateValue {
    const context = useContext(AuthStateContext);
    if (!context)
        throw new Error("useAuthState must be used within an AuthProvider");
    return context;
}

/** Only profile + balance — won't re-render on apiKey changes */
export function useAuthProfile(): AuthProfileValue {
    const context = useContext(AuthProfileContext);
    if (!context)
        throw new Error("useAuthProfile must be used within an AuthProvider");
    return context;
}

/** Only login/logout — stable refs, never triggers re-renders */
export function useAuthActions(): AuthActionsValue {
    const context = useContext(AuthActionsContext);
    if (!context)
        throw new Error("useAuthActions must be used within an AuthProvider");
    return context;
}

/**
 * Combined hook for backward compatibility.
 * Prefer useAuthState/useAuthProfile/useAuthActions for targeted subscriptions.
 */
export function useAuth(): AuthContextValue {
    const state = useAuthState();
    const profileData = useAuthProfile();
    const actions = useAuthActions();
    return { ...state, ...profileData, ...actions };
}
