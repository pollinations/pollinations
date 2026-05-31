import { useAuthActions, useAuthState } from "@pollinations_ai/sdk/react";
import type { ReactNode } from "react";
import { Button, type ButtonProps } from "../../primitives/Button.tsx";

export type LoginButtonProps = Omit<
    ButtonProps<"button">,
    "as" | "onClick" | "children"
> & {
    children: ReactNode;
};

/** Button that kicks off the auth redirect. `null` when already logged in. */
export function LoginButton({ children, ...buttonProps }: LoginButtonProps) {
    const { isLoggedIn } = useAuthState();
    const { login } = useAuthActions();
    if (isLoggedIn) return null;
    return (
        <Button {...buttonProps} onClick={() => login()}>
            {children}
        </Button>
    );
}
