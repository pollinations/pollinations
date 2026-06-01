import { useAuthState } from "@pollinations/sdk/react";
import { Fragment, type ReactNode } from "react";

export type WhenLoggedInProps = { children: ReactNode };

/** Renders `children` only when a user is signed in. */
export function WhenLoggedIn({ children }: WhenLoggedInProps) {
    const { isLoggedIn } = useAuthState();
    if (!isLoggedIn) return null;
    return <Fragment>{children}</Fragment>;
}
