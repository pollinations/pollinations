import type { ButtonProps } from "../../primitives/Button.tsx";
import { GitHubIcon } from "../../primitives/icons/index.tsx";
import { ProviderSignInButton } from "./ProviderSignInButton.tsx";

export type GitHubSignInButtonProps = Omit<
    ButtonProps<"button">,
    "as" | "children"
> & { isSigningIn?: boolean; retry?: boolean; pendingLabel?: string };

/** GitHub authentication, before a user reviews a Pollen Connect request. */
export function GitHubSignInButton({
    className,
    isSigningIn = false,
    pendingLabel = "Signing in…",
    retry = false,
    disabled,
    type = "button",
    ...props
}: GitHubSignInButtonProps) {
    return (
        <ProviderSignInButton
            {...props}
            type={type}
            disabled={disabled || isSigningIn}
            aria-busy={isSigningIn}
            className={className}
            icon={
                <GitHubIcon
                    aria-hidden="true"
                    className="polli:h-5 polli:w-5 polli:shrink-0"
                />
            }
        >
            {isSigningIn
                ? pendingLabel
                : retry
                  ? "Try again"
                  : "Sign in with GitHub"}
        </ProviderSignInButton>
    );
}
