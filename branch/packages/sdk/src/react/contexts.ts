import { createContext } from "react";
import type { AccountPermission } from "../types.js";

export interface AuthStateValue {
    apiKey: string | null;
    isLoggedIn: boolean;
    isHydrated: boolean;
    error: Error | null;
}

/**
 * Per-call overrides for the OAuth authorize redirect. Each field maps to a
 * BYOP (bring-your-own-policy) URL parameter on `enter.pollinations.ai/authorize`
 * — see `<PolliProvider>` props for the same fields as provider-level defaults.
 */
export interface AuthorizeRequest {
    /** Extra OAuth scopes appended to provider defaults. */
    permissions?: AccountPermission[];
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
    setApiKey: (apiKey: string | null) => void;
    /** Resolved enter URL, useful for top-up / dashboard links. */
    enterUrl: string;
    /** Resolved account API URL used by opt-in account hooks. */
    apiBaseUrl: string;
}

export interface AuthContextValue extends AuthStateValue, AuthActionsValue {}

export const AuthContext = createContext<AuthContextValue | null>(null);
