import { useCallback, useEffect, useRef, useState } from "react";
import type { Message } from "@/types";

const AUTH_KEY = "pollinations_api_key";
const MODEL_KEY = "pollinations_model";
const ENTER_URL = "https://enter.pollinations.ai";
const API_BASE = "https://enter.pollinations.ai/api";
const API_KEY_PREFIX = /^(sk_|plln_pk_|pk_)/;

export const DEFAULT_MODEL = "deepseek";

export const AVAILABLE_MODELS = [
    { id: "deepseek", label: "DeepSeek" },
    { id: "kimi", label: "Kimi" },
    { id: "gemini-fast", label: "Gemini" },
    { id: "claude-fast", label: "Claude" },
] as const;

export interface UserProfile {
    githubUsername: string | null;
    image: string | null;
}

export interface UserBalance {
    balance: number;
}

export function getStoredApiKey(): string | null {
    try {
        return localStorage.getItem(AUTH_KEY);
    } catch {
        return null;
    }
}

function storeApiKey(key: string): void {
    localStorage.setItem(AUTH_KEY, key);
}

function clearApiKey(): void {
    localStorage.removeItem(AUTH_KEY);
}

function extractApiKeyFromFragment(): string | null {
    const hash = window.location.hash.substring(1);
    if (!hash) return null;
    try {
        const key = new URLSearchParams(hash).get("api_key");
        return key && API_KEY_PREFIX.test(key) ? key : null;
    } catch {
        return null;
    }
}

const APP_KEY = "pk_vbqLj6cwn05D2v5B";

function getAuthorizeUrl(): string {
    const redirect = window.location.href.split("#")[0];
    return `${ENTER_URL}/authorize?${new URLSearchParams({ redirect_url: redirect, app_key: APP_KEY, permissions: "profile,balance" })}`;
}

export function useBYOP() {
    const [apiKey, setApiKey] = useState<string | null>(getStoredApiKey);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [balance, setBalance] = useState<UserBalance | null>(null);
    const [isLoadingProfile, setIsLoadingProfile] = useState(false);

    // Extract API key from URL fragment on mount (OAuth redirect callback)
    useEffect(() => {
        const key = extractApiKeyFromFragment();
        if (key) {
            storeApiKey(key);
            setApiKey(key);
            window.history.replaceState(
                {},
                "",
                window.location.pathname + window.location.search,
            );
        }
    }, []);

    // Fetch profile and balance when API key is available
    useEffect(() => {
        if (!apiKey) {
            setProfile(null);
            setBalance(null);
            return;
        }

        setIsLoadingProfile(true);

        const headers = { Authorization: `Bearer ${apiKey}` };

        const fetchProfile = async () => {
            try {
                const res = await fetch(`${API_BASE}/account/profile`, {
                    headers,
                });
                if (res.status === 401) {
                    clearApiKey();
                    setApiKey(null);
                    return;
                }
                if (!res.ok) return;
                const data = await res.json();
                setProfile({
                    githubUsername: data.githubUsername,
                    image: data.image ?? null,
                });
            } catch {
                // Profile fetch failed silently
            }
        };

        const fetchBalance = async () => {
            try {
                const res = await fetch(`${API_BASE}/account/balance`, {
                    headers,
                });
                if (!res.ok) return;
                const data = await res.json();
                setBalance({ balance: data.balance });
            } catch {
                // Balance fetch failed silently
            }
        };

        Promise.all([fetchProfile(), fetchBalance()]).finally(() => {
            setIsLoadingProfile(false);
        });
    }, [apiKey]);

    const login = useCallback(() => {
        window.location.href = getAuthorizeUrl();
    }, []);

    const logout = useCallback(() => {
        clearApiKey();
        setApiKey(null);
        setProfile(null);
        setBalance(null);
    }, []);

    return { apiKey, profile, balance, isLoadingProfile, login, logout };
}

export function getStoredModel(): string {
    try {
        return localStorage.getItem(MODEL_KEY) || DEFAULT_MODEL;
    } catch {
        return DEFAULT_MODEL;
    }
}

export function useModelSelector() {
    const [model, setModelState] = useState<string>(getStoredModel);

    function setModel(m: string) {
        localStorage.setItem(MODEL_KEY, m);
        setModelState(m);
    }

    return { model, setModel };
}

// UI Hooks

export function useMessageScroll(messages: Message[]) {
    const ref = useRef<HTMLDivElement>(null);
    // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on new messages
    useEffect(() => {
        ref.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);
    return ref;
}

export function useInput(isLoading: boolean) {
    const ref = useRef<HTMLInputElement>(null);
    useEffect(() => {
        if (!isLoading && ref.current) {
            ref.current.focus();
        }
    }, [isLoading]);
    return { inputRef: ref };
}
