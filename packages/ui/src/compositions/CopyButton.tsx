import {
    type ButtonHTMLAttributes,
    type MouseEvent,
    type ReactNode,
    useEffect,
    useRef,
    useState,
} from "react";
import { cn } from "../lib/cn.ts";
import { Button, type ButtonProps } from "../primitives/Button.tsx";
import { CheckIcon, ClipboardIcon } from "../primitives/icons/index.tsx";
import type { IconProps } from "../primitives/icons/types.ts";
import { Tooltip } from "../primitives/Tooltip.tsx";

/** The copy state as an icon: a clipboard, then an amber check once copied.
 * The icon is the only thing a copy changes: labels and colours stay put. */
export function CopyStateIcon({
    copied,
    className,
    ...props
}: IconProps & { copied: boolean }) {
    return copied ? (
        <CheckIcon
            {...props}
            data-theme="accent"
            className={cn(className, "polli:text-theme-text-soft")}
        />
    ) : (
        <ClipboardIcon {...props} className={className} />
    );
}

type CopyValue = string | (() => string | Promise<string>);

/** How long the check shows, the same for every copy button. */
const COPIED_MS = 1500;

export type CopyButtonProps = Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    "children" | "className" | "onClick" | "type" | "value"
> & {
    value: CopyValue;
    children: ReactNode | ((copied: boolean) => ReactNode);
    /** Extra hover content, e.g. the full value behind a short label. Copy
     * buttons don't need one to say "copy": the icon does. */
    tooltip?: ReactNode;
    tooltipAlign?: "start" | "center";
    tooltipClampToViewport?: boolean;
    tooltipMaxWidth?: number;
    tooltipClassName?: string;
    className?: string | ((copied: boolean) => string);
    variant?: "plain" | "button";
    /** Button intent, used with `variant="button"`. */
    intent?: ButtonProps<"button">["intent"];
    onCopied?: () => void;
    onCopyError?: (error: unknown) => void;
};

export function CopyButton({
    value,
    children,
    tooltip,
    tooltipAlign,
    tooltipClampToViewport,
    tooltipMaxWidth,
    tooltipClassName,
    className,
    variant = "plain",
    intent,
    onCopied,
    onCopyError,
    ...buttonProps
}: CopyButtonProps) {
    const [copied, setCopied] = useState(false);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(
        () => () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        },
        [],
    );

    async function handleCopy(event: MouseEvent<HTMLButtonElement>) {
        event.stopPropagation();
        try {
            const text = typeof value === "function" ? await value() : value;
            await navigator.clipboard.writeText(text);
            setCopied(true);
            onCopied?.();
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            timeoutRef.current = setTimeout(() => setCopied(false), COPIED_MS);
        } catch (error) {
            onCopyError?.(error);
        }
    }

    const Control = variant === "button" ? Button : "button";
    const button = (
        <Control
            {...buttonProps}
            {...(variant === "button" && intent ? { intent } : {})}
            type="button"
            onClick={handleCopy}
            className={cn(
                "polli-control",
                buttonProps.disabled
                    ? "polli:cursor-not-allowed"
                    : "polli:cursor-pointer",
                typeof className === "function" ? className(copied) : className,
            )}
        >
            {typeof children === "function" ? children(copied) : children}
            {/* Said, not shown: the icon is the visible answer. */}
            <span className="polli:sr-only" aria-live="polite">
                {copied ? "Copied" : ""}
            </span>
        </Control>
    );

    if (!tooltip) return button;

    return (
        <Tooltip
            triggerAs="span"
            content={tooltip}
            align={tooltipAlign}
            clampToViewport={tooltipClampToViewport}
            maxWidth={tooltipMaxWidth}
            displayContents
            tapEnabled={false}
            className={cn(
                buttonProps.disabled
                    ? "polli:cursor-not-allowed"
                    : "polli:cursor-pointer",
                tooltipClassName,
            )}
        >
            {button}
        </Tooltip>
    );
}
