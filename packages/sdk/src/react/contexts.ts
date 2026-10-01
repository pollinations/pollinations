import { createContext } from "react";
import type { AccountPermission } from "../types.js";

export interface AuthStateValue {
    apiKey: string | null;
    isLoggedIn: boolean;
    isHydrated: boolean;
    error: Error | null;
}

/**
 * Options for login(). Omitted fields use the provider's defaults.
 */
export interface AuthorizeRequest {
    /** Extra OAuth scopes appended to provider defaults. */
    permissions?: AccountPermission[];
    /** Allowed models. Pass [] for all models. */
    models?: string[];
    /** Pollen budget for the key. */
    budget?: number;
    /** Key lifetime in days. */
    expiry?: number;
}

export interface AuthActionsValue {
    login: (request?: AuthorizeRequest) => void;
    logout: () => void;
    setApiKey: (apiKey: string | null) => void;
    /** Auth and dashboard URL. */
    enterUrl: string;
    /** Base URL for account hooks. */
    apiBaseUrl: string;
}

export interface AuthContextValue extends AuthStateValue, AuthActionsValue {}

export const AuthContext = createContext<AuthContextValue | null>(null);
