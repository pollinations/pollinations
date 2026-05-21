import { useAuthActions } from "@pollinations_ai/sdk/react";
import type { ReactNode } from "react";
import type { ThemeName } from "../theme.ts";
import { LinkButton } from "../ui/link-button.tsx";

export type TopUpLinkProps = {
    children?: ReactNode;
    theme?: ThemeName;
    size?: "small" | "medium" | "large";
    className?: string;
    /** Override the destination. Defaults to `${enterUrl}/pricing`. */
    href?: string;
};

/** Link to the top-up / pricing page on `enter.pollinations.ai`. Opens in new tab. */
export function TopUpLink({
    children,
    theme = "amber",
    size = "medium",
    className,
    href,
}: TopUpLinkProps) {
    const { enterUrl } = useAuthActions();
    return (
        <LinkButton
            theme={theme}
            href={href ?? `${enterUrl}/pricing`}
            size={size}
            className={className}
        >
            {children ?? "Top up"}
        </LinkButton>
    );
}
