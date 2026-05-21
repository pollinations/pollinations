import { createContext } from "react";
import type { AccountBalance, AccountProfile } from "../types.js";

export type UserProfile = AccountProfile;
export type UserBalance = AccountBalance;

export interface AuthStateValue {
    apiKey: string | null;
    isLoggedIn: boolean;
}

export interface AuthProfileValue {
    profile: UserProfile | null;
    balance: UserBalance | null;
    isLoadingProfile: boolean;
}

export interface AuthActionsValue {
    login: (permissions?: string[]) => void;
    logout: () => void;
    /** Configured permissions on this provider. */
    permissions: readonly string[];
    /** Resolved enter URL, useful for top-up links. */
    enterUrl: string;
}

export interface AuthContextValue
    extends AuthStateValue,
        AuthProfileValue,
        AuthActionsValue {}

export const AuthStateContext = createContext<AuthStateValue | null>(null);
export const AuthProfileContext = createContext<AuthProfileValue | null>(null);
export const AuthActionsContext = createContext<AuthActionsValue | null>(null);
