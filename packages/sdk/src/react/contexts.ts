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

/**
 * Per-call overrides for the OAuth authorize redirect. Each field maps to a
 * BYOP (bring-your-own-policy) URL parameter on `enter.pollinations.ai/authorize`
 * — see `<PolliProvider>` props for the same fields as provider-level defaults.
 */
export interface AuthorizeRequest {
    /** Extra OAuth scopes appended to provider defaults. */
    permissions?: string[];
    /** Restrict the minted key to these model slugs. Omit / empty = all models. */
    models?: string[];
    /** Pollen budget to request for the minted key. */
    budget?: number;
    /** Days until the minted key expires. */
    expiry?: number;
}

export interface AuthActionsValue {
    login: (request?: AuthorizeRequest) => void;
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
