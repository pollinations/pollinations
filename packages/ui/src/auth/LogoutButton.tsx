import { useAuthActions, useAuthState } from "@pollinations_ai/sdk/react";
import type { ReactNode } from "react";
import { Button, type ButtonProps } from "../primitives/Button.tsx";

export type LogoutButtonProps = Omit<
    ButtonProps<"button">,
    "as" | "onClick" | "children"
> & {
    children: ReactNode;
};

/** Button that clears the session. `null` when logged out. */
export function LogoutButton({ children, ...buttonProps }: LogoutButtonProps) {
    const { isLoggedIn } = useAuthState();
    const { logout } = useAuthActions();
    if (!isLoggedIn) return null;
    return (
        <Button {...buttonProps} onClick={() => logout()}>
            {children}
        </Button>
    );
}
