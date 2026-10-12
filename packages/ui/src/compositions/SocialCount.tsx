import type { ElementType, PropsWithChildren } from "react";
import { cn } from "../lib/cn.ts";
import { DiscordIcon, GitHubIcon } from "../primitives/icons/index.tsx";

const networks = {
    discord: {
        Icon: DiscordIcon,
        className:
            "polli:bg-social-discord polli:text-social-discord-text polli:hover:brightness-110",
    },
    github: {
        Icon: GitHubIcon,
        className:
            "polli:border polli:border-social-github-border polli:bg-social-github polli:text-social-github-text polli:hover:bg-social-github-hover",
    },
} as const;

type BaseSocialCountProps = {
    network: keyof typeof networks;
    /** Off when the network icon already sits next to the pill. */
    showIcon?: boolean;
    className?: string;
};

export type SocialCountProps<T extends ElementType = "a"> =
    PropsWithChildren<BaseSocialCountProps> & { as?: T } & Omit<
            React.ComponentPropsWithoutRef<T>,
            keyof BaseSocialCountProps | "as"
        >;

/**
 * A live community count (Discord online, GitHub stars) in the network's own
 * colours, at the colour-mode toggle's 28px height so the header has one
 * small-pill size. A link by default; `as="span"` inside another link.
 */
export function SocialCount<T extends ElementType = "a">({
    as,
    network,
    showIcon = true,
    className,
    children,
    ...rest
}: SocialCountProps<T>) {
    const Component: ElementType = as || "a";
    const { Icon, className: colours } = networks[network];

    return (
        <Component
            {...rest}
            className={cn(
                "polli-control polli:inline-flex polli:h-7 polli:shrink-0 polli:items-center polli:gap-1.5 polli:rounded-full polli:px-2.5 polli:font-semibold polli:text-xs polli:leading-none polli:transition-colors",
                colours,
                className,
            )}
        >
            {showIcon ? (
                <Icon
                    aria-hidden="true"
                    className="polli:size-3.5 polli:shrink-0"
                />
            ) : null}
            {children}
        </Component>
    );
}
