import logoUrl from "../../brand/mark.svg";
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
            icon={
                <span
                    aria-hidden="true"
                    className="polli:block polli:h-5 polli:w-5 polli:shrink-0 polli:bg-current"
                    style={{
                        mask: `url('${logoUrl}') center / contain no-repeat`,
                        WebkitMask: `url('${logoUrl}') center / contain no-repeat`,
                    }}
                />
            }
        >
            {children ?? "Connect with Pollinations"}
        </ProviderSignInButton>
    );
}
