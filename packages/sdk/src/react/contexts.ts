import { createContext } from "react";
import type { Pollinations } from "../client.js";
import type { AccountBalance, AccountProfile, KeyInfo } from "../types.js";

export type UserProfile = AccountProfile;
export type UserBalance = AccountBalance;
export type UserKey = KeyInfo;

export interface AuthStateValue {
    apiKey: string | null;
    isLoggedIn: boolean;
}

export interface AuthProfileValue {
    profile: UserProfile | null;
    balance: UserBalance | null;
    isLoadingProfile: boolean;
}

export interface AuthKeyValue {
    key: UserKey | null;
    /** Account scopes actually present on the current API key. */
    permissions: readonly string[];
    isLoadingKey: boolean;
}

export interface AuthActionsValue {
    login: (permissions?: string[]) => void;
    logout: () => void;
    refreshProfile: () => Promise<void>;
    refreshBalance: () => Promise<void>;
    refreshKey: () => Promise<void>;
    refreshAuth: () => Promise<void>;
    /** Resolved enter URL, useful for top-up / dashboard links. */
    enterUrl: string;
}

export interface AuthContextValue
    extends AuthStateValue,
        AuthProfileValue,
        AuthKeyValue,
        AuthActionsValue {}

export const AuthStateContext = createContext<AuthStateValue | null>(null);
export const AuthProfileContext = createContext<AuthProfileValue | null>(null);
export const AuthKeyContext = createContext<AuthKeyValue | null>(null);
export const AuthActionsContext = createContext<AuthActionsValue | null>(null);

/**
 * Memoized API client. Null when logged out. Exposed via `useAuthClient` for
 * advanced use cases (calling SDK methods not yet covered by a dedicated hook)
 * and consumed internally by `useKeyUsage` etc. so each query hook doesn't
 * instantiate its own client.
 */
export const AuthClientContext = createContext<Pollinations | null>(null);
