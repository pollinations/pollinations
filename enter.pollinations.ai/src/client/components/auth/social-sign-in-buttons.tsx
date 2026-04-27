import {
    SOCIAL_PROVIDERS,
    type SocialProvider,
} from "../../lib/social-providers.ts";
import { Button } from "../button.tsx";

type SocialSignInButtonsProps = {
    pendingProvider: SocialProvider | null;
    disabled?: boolean;
    color?: "amber" | "dark";
    className?: string;
    onSignIn: (provider: SocialProvider) => void;
};

export function SocialSignInButtons({
    pendingProvider,
    disabled,
    color = "dark",
    className = "flex flex-wrap gap-2 justify-end",
    onSignIn,
}: SocialSignInButtonsProps) {
    return (
        <div className={className}>
            {SOCIAL_PROVIDERS.map((provider) => {
                const isPending = pendingProvider === provider.id;
                return (
                    <Button
                        key={provider.id}
                        as="button"
                        onClick={() => onSignIn(provider.id)}
                        disabled={disabled || pendingProvider !== null}
                        color={color}
                        weight={color === "amber" ? "light" : "strong"}
                        className="whitespace-nowrap"
                    >
                        {isPending
                            ? "Signing in..."
                            : `Continue with ${provider.label}`}
                    </Button>
                );
            })}
        </div>
    );
}
