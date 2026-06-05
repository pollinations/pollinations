import {
    type ButtonHTMLAttributes,
    type MouseEvent,
    type ReactNode,
    useEffect,
    useRef,
    useState,
} from "react";
import { cn } from "../lib/cn.ts";
import { Tooltip } from "../primitives/Tooltip.tsx";

type CopyValue = string | (() => string | Promise<string>);

export type CopyButtonProps = Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    "children" | "className" | "onClick" | "type" | "value"
> & {
    value: CopyValue;
    children: ReactNode | ((copied: boolean) => ReactNode);
    copiedTimeoutMs?: number;
    tooltip?: ReactNode;
    copiedTooltip?: ReactNode;
    tooltipClassName?: string;
    className?: string | ((copied: boolean) => string);
    onCopied?: () => void;
    onCopyError?: (error: unknown) => void;
};

export function CopyButton({
    value,
    children,
    copiedTimeoutMs = 2000,
    tooltip = "Click to copy",
    copiedTooltip = "Copied!",
    tooltipClassName,
    className,
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
            timeoutRef.current = setTimeout(
                () => setCopied(false),
                copiedTimeoutMs,
            );
        } catch (error) {
            onCopyError?.(error);
        }
    }

    const button = (
        <button
            {...buttonProps}
            type="button"
            onClick={handleCopy}
            className={cn(
                "polli-control",
                typeof className === "function" ? className(copied) : className,
            )}
        >
            {typeof children === "function" ? children(copied) : children}
        </button>
    );

    return (
        <Tooltip
            triggerAs="span"
            content={copied ? copiedTooltip : tooltip}
            className={tooltipClassName}
        >
            {button}
        </Tooltip>
    );
}
