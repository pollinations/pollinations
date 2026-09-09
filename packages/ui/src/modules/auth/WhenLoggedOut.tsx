import { useAuthState } from "@pollinations/sdk/react";
import { Fragment, type ReactNode } from "react";

export type WhenLoggedOutProps = { children: ReactNode };

/** Renders `children` only when no user is signed in. */
export function WhenLoggedOut({ children }: WhenLoggedOutProps) {
    const { isLoggedIn } = useAuthState();
    if (isLoggedIn) return null;
    return <Fragment>{children}</Fragment>;
}
