import { useAuthActions, useAuthState } from "@pollinations_ai/sdk/react";
import type { ReactNode } from "react";
import { Button, type ButtonProps } from "../index.ts";

export type LogoutButtonProps = Omit<
    ButtonProps<"button">,
    "as" | "onClick" | "children"
> & {
    children?: ReactNode;
};

/** Renders a Button that clears the session. Renders `null` when logged out. */
export function LogoutButton({ children, ...buttonProps }: LogoutButtonProps) {
    const { isLoggedIn } = useAuthState();
    const { logout } = useAuthActions();
    if (!isLoggedIn) return null;
    return (
        <Button {...buttonProps} onClick={() => logout()}>
            {children ?? "Log out"}
        </Button>
    );
}
