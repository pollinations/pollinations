import { useAuthActions, useAuthState } from "@pollinations/sdk/react";
import {
    PollinationsSignInButton,
    type PollinationsSignInButtonProps,
} from "./PollinationsSignInButton.tsx";

export type LoginButtonProps = Omit<PollinationsSignInButtonProps, "onClick">;

/** Starts Pollen Connect authorization; hidden when already connected. */
export function LoginButton({ children, ...buttonProps }: LoginButtonProps) {
    const { isLoggedIn } = useAuthState();
    const { login } = useAuthActions();
    if (isLoggedIn) return null;
    return (
        <PollinationsSignInButton {...buttonProps} onClick={() => login()}>
            {children}
        </PollinationsSignInButton>
    );
}
