import type {
    PropsWithChildren,
    MouseEvent as ReactMouseEvent,
    ReactNode,
} from "react";
import { cn } from "../lib/cn.ts";
import { CheckIcon } from "./icons/index.tsx";

/** Semantic action roles. Label recipes live on Chip. */
type ButtonIntent =
    | "danger"
    | "info"
    | "neutral"
    | "brand"
    | "commit"
    | "surface";
export type ButtonAppearance = "pill" | "raised";

const pillSizes = {
    icon: "polli:h-12 polli:w-12 polli:p-0",
    xs: "polli:h-5 polli:px-1.5 polli:py-0 polli:text-[11px] polli:leading-none",
    sm: "polli:min-h-7 polli:px-2 polli:pt-0.5 polli:pb-1",
    md: "polli:min-h-9 polli:px-4 polli:pt-1.5 polli:pb-2",
    lg: "polli:min-h-12 polli:px-6 polli:py-3 polli:text-base",
} as const;

const raisedSizes = {
    icon: "polli:h-12 polli:w-12 polli:p-0",
    xs: "polli:px-2 polli:py-1 polli:text-xs",
    sm: "polli:px-4 polli:py-2 polli:text-sm",
    md: "polli:px-7 polli:py-3.5 polli:text-base",
    lg: "polli:px-8 polli:py-4 polli:text-lg",
} as const;

const appearanceClasses: Record<ButtonAppearance, string> = {
    pill: "polli:rounded-full",
    raised:
        "polli:rounded-xl polli:border-r-[3px] polli:border-b-[3px] polli:border-solid " +
        "polli:border-theme-text-strong/20 polli:hover:border-theme-text-strong/45",
};

// Cascade-driven base — reads [data-theme] vars. The filled button is the
// fill / on-fill pair: the same honey with dark text as a selected tab, in both
// modes (grey inside neutral chrome). Quiet buttons use `neutral`.
const themeClasses =
    "polli:bg-theme-fill polli:text-theme-on-fill " +
    "polli:hover:bg-theme-fill-hover polli:transition-colors";

// Primary actions (`brand`, `commit`) are the nectar style: an ink outline that
// fills with honey on hover and focus, and Polli waggles while busy. The look
// lives in styles/index.css (.polli-nectar). `done` holds the honey fill, shows
// a check and puffs pollen once an action has succeeded.
const nectarIntents: ButtonIntent[] = ["brand", "commit"];
const intentClasses: Record<ButtonIntent, string> = {
    brand: "polli-nectar",
    commit: "polli-nectar",
    danger:
        "polli:border polli:border-intent-danger-text polli:bg-intent-danger-bg-light polli:text-intent-danger-text " +
        "polli:hover:bg-intent-danger-bg-hover polli:focus-visible:bg-intent-danger-bg-hover polli:transition-colors " +
        "polli:[.dark_&]:bg-transparent polli:[.dark_&]:hover:bg-intent-danger-bg-hover polli:[.dark_&]:focus-visible:bg-intent-danger-bg-hover",
    info:
        "polli:bg-intent-info-bg-light polli:text-intent-info-text " +
        "polli:hover:bg-intent-info-bg-hover polli:transition-colors",
    // A quiet white pill on the desk, like the colour toggle; hover is the
    // same pale wash of the fill as an unselected tab or menu row.
    surface:
        "polli:bg-surface-opaque polli:text-theme-text-strong " +
        "polli:hover:bg-theme-fill-wash polli:transition-colors",
    // Secondary actions never take the accent: one step stronger grey on hover.
    neutral:
        "polli:bg-theme-bg-subtle polli:text-theme-text-base " +
        "polli:hover:bg-theme-text-muted/25 polli:hover:text-theme-text-strong polli:transition-colors",
};

const pollenGrains = [0, 1, 2, 3, 4, 5, 6, 7];

type BaseButtonProps = {
    icon?: ReactNode;
    /** Optional semantic recipe; omit for the ambient theme button. */
    intent?: ButtonIntent;
    /** `raised` is the stronger website CTA treatment. */
    appearance?: ButtonAppearance;
    size?: keyof typeof pillSizes;
    className?: string;
    disabled?: boolean;
    /** The action just succeeded; shown briefly before the flow moves on. */
    done?: boolean;
};

const buttonClasses = ({
    intent,
    appearance = "pill",
    size,
    className,
    disabled,
    busy,
    done,
}: BaseButtonProps & { busy?: boolean }) => {
    const colorClasses = intent ? intentClasses[intent] : themeClasses;
    const sizeClasses = appearance === "raised" ? raisedSizes : pillSizes;
    return cn(
        "polli-control polli:inline-flex polli:items-center polli:justify-center polli:self-center polli:font-body polli:text-sm polli:font-medium polli:leading-normal polli:box-border polli:border polli:border-transparent",
        // A busy or done button is not unavailable: it keeps its strength.
        busy || done
            ? done
                ? "polli:cursor-default"
                : "polli:cursor-progress"
            : disabled
              ? "polli:opacity-50 polli:cursor-not-allowed"
              : "polli:hover:filter polli:hover:brightness-105 polli:cursor-pointer",
        colorClasses,
        appearanceClasses[appearance],
        sizeClasses[size || "md"],
        className,
    );
};

export type ButtonProps<T extends React.ElementType = "button"> =
    PropsWithChildren<BaseButtonProps> & {
        as?: T;
    } & Omit<React.ComponentPropsWithoutRef<T>, keyof BaseButtonProps | "as">;

export function Button<T extends React.ElementType = "button">({
    as,
    children,
    icon,
    intent,
    appearance,
    size,
    className,
    disabled,
    done,
    ...buttonProps
}: ButtonProps<T>) {
    const Component: React.ElementType = as || "button";
    const isButton = Component === "button";
    const isAnchor = Component === "a";
    const buttonType = (
        buttonProps as {
            type?: "button" | "submit" | "reset";
        }
    ).type;
    const onClick = (
        buttonProps as {
            onClick?: (event: ReactMouseEvent) => void;
        }
    ).onClick;
    const ariaBusy = (
        buttonProps as { "aria-busy"?: boolean | "true" | "false" }
    )["aria-busy"];
    const busy = ariaBusy === true || ariaBusy === "true";
    const nectar = intent !== undefined && nectarIntents.includes(intent);
    const handleClick = disabled
        ? (event: ReactMouseEvent) => {
              event.preventDefault();
              event.stopPropagation();
          }
        : onClick;

    return (
        <Component
            {...buttonProps}
            data-intent={intent}
            data-done={done || undefined}
            {...(isButton ? { type: buttonType ?? "button", disabled } : {})}
            {...(!isButton && disabled
                ? { "aria-disabled": true, tabIndex: -1 }
                : {})}
            {...(isAnchor && disabled ? { href: undefined } : {})}
            onClick={handleClick}
            className={buttonClasses({
                intent,
                appearance,
                size,
                className,
                disabled,
                busy,
                done,
            })}
        >
            {nectar && <span aria-hidden="true" className="polli-nectar-fx" />}
            {icon && (
                <span
                    aria-hidden="true"
                    className="polli:relative polli:mr-2 polli:flex polli:size-4 polli:shrink-0 polli:[&>svg]:size-full"
                >
                    {/* One loading sign everywhere: Polli waggles in the
                        icon slot of any busy button. */}
                    {done && nectar ? (
                        <CheckIcon />
                    ) : busy ? (
                        <span className="polli-bee" />
                    ) : (
                        icon
                    )}
                </span>
            )}
            {children}
            {nectar && done && (
                <span aria-hidden="true" className="polli-burst">
                    {pollenGrains.map((grain) => (
                        <i key={grain} />
                    ))}
                </span>
            )}
        </Component>
    );
}
