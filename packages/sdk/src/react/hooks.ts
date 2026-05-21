import { useContext } from "react";
import {
    AuthActionsContext,
    type AuthActionsValue,
    type AuthContextValue,
    AuthProfileContext,
    type AuthProfileValue,
    AuthStateContext,
    type AuthStateValue,
} from "./contexts.js";

/** Only `apiKey` + `isLoggedIn`; does not re-render on profile/balance changes. */
export function useAuthState(): AuthStateValue {
    const ctx = useContext(AuthStateContext);
    if (!ctx) {
        throw new Error("useAuthState must be used within a <PolliProvider>");
    }
    return ctx;
}

/** Only `profile` + `balance`; does not re-render on `apiKey` changes. */
export function useAuthProfile(): AuthProfileValue {
    const ctx = useContext(AuthProfileContext);
    if (!ctx) {
        throw new Error("useAuthProfile must be used within a <PolliProvider>");
    }
    return ctx;
}

/** Stable login/logout refs + provider config (`permissions`, `enterUrl`). */
export function useAuthActions(): AuthActionsValue {
    const ctx = useContext(AuthActionsContext);
    if (!ctx) {
        throw new Error("useAuthActions must be used within a <PolliProvider>");
    }
    return ctx;
}

/**
 * Combined hook. Prefer `useAuthState` / `useAuthProfile` / `useAuthActions`
 * for narrower subscriptions.
 */
export function useAuth(): AuthContextValue {
    return {
        ...useAuthState(),
        ...useAuthProfile(),
        ...useAuthActions(),
    };
}
