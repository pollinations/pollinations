import type { ButtonProps } from "../../primitives/Button.tsx";
import { GitHubIcon } from "../../primitives/icons/index.tsx";
import { ProviderSignInButton } from "./ProviderSignInButton.tsx";

/** The GitHub action uses the same layout as Pollinations sign-in. */
export function GitHubSignInButton({
    isSigningIn = false,
    disabled,
    ...props
}: Omit<ButtonProps<"button">, "as" | "children"> & {
    isSigningIn?: boolean;
}) {
    return (
        <ProviderSignInButton
            {...props}
            disabled={disabled || isSigningIn}
            aria-busy={isSigningIn}
            icon={
                <GitHubIcon
                    aria-hidden="true"
                    className="polli:h-5 polli:w-5 polli:shrink-0"
                />
            }
        >
            {isSigningIn ? "Signing in…" : "Sign in with GitHub"}
        </ProviderSignInButton>
    );
}
