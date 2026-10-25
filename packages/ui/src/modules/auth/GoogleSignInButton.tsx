import type { ButtonProps } from "../../primitives/Button.tsx";
import { GoogleIcon } from "../../primitives/icons/index.tsx";
import { ProviderSignInButton } from "./ProviderSignInButton.tsx";

/** The Google action uses the same layout as GitHub sign-in. */
export function GoogleSignInButton({
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
                <GoogleIcon
                    aria-hidden="true"
                    className="polli:h-5 polli:w-5 polli:shrink-0"
                />
            }
        >
            {isSigningIn ? "Signing in…" : "Sign in with Google"}
        </ProviderSignInButton>
    );
}
