import { BrandMark } from "../../primitives/BrandMark.tsx";
import type { ButtonProps } from "../../primitives/Button.tsx";
import { ProviderSignInButton } from "./ProviderSignInButton.tsx";

export type PollinationsSignInButtonProps = Omit<
    ButtonProps<"button">,
    "as"
> & {
    isPending?: boolean;
};

/** Provider identity button; the app supplies its own sign-in action. */
export function PollinationsSignInButton({
    className,
    children,
    type = "button",
    isPending = false,
    disabled,
    ...props
}: PollinationsSignInButtonProps) {
    return (
        <ProviderSignInButton
            type={type}
            {...props}
            disabled={disabled || isPending}
            aria-busy={isPending}
            className={className}
            icon={<BrandMark className="polli:h-5 polli:w-5" />}
        >
            {children ?? "Connect with Pollinations"}
        </ProviderSignInButton>
    );
}
