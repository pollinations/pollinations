import type { ComponentPropsWithoutRef, FC } from "react";
import { cn } from "../lib/cn.ts";
import { CheckIcon, ClipboardIcon } from "../primitives/icons/index.tsx";
import { CopyButton } from "./CopyButton.tsx";

type CodeBlockOwnProps = {
    code: string;
    codeClassName?: string;
    language?: string;
};

export type CodeBlockProps = CodeBlockOwnProps &
    Omit<ComponentPropsWithoutRef<"div">, keyof CodeBlockOwnProps | "children">;

export const CodeBlock: FC<CodeBlockProps> = ({
    code,
    codeClassName,
    language,
    className,
    ...rest
}) => {
    const label = language || "Code";

    return (
        <div
            {...rest}
            className={cn(
                "polli:min-w-0 polli:max-w-full polli:overflow-hidden polli:rounded-lg polli:border polli:border-theme-border polli:bg-theme-bg-pale",
                className,
            )}
        >
            <div className="polli:flex polli:min-h-9 polli:items-center polli:justify-between polli:gap-3 polli:bg-theme-bg-subtle polli:px-3 polli:py-1.5">
                <span className="polli:truncate polli:font-mono polli:text-[11px] polli:font-medium polli:uppercase polli:tracking-wide polli:text-theme-text-muted">
                    {label}
                </span>
                <CopyButton
                    value={code}
                    tooltip={null}
                    aria-label="Copy code"
                    className="polli:flex polli:items-center polli:gap-1.5 polli:rounded-md polli:px-2 polli:py-1 polli:text-xs polli:font-medium polli:text-theme-text-base polli:transition-colors polli:hover:bg-theme-bg-hover polli:hover:text-theme-text-hover"
                >
                    {(copied) => (
                        <>
                            {copied ? (
                                <CheckIcon className="polli:size-3.5" />
                            ) : (
                                <ClipboardIcon className="polli:size-3.5" />
                            )}
                            <span>{copied ? "Copied" : "Copy"}</span>
                        </>
                    )}
                </CopyButton>
            </div>
            <pre
                className={cn(
                    "polli:m-0 polli:min-w-0 polli:whitespace-pre-wrap polli:break-words polli:[overflow-wrap:anywhere] polli:[tab-size:4] polli:p-3 polli:font-mono polli:text-xs polli:leading-6 polli:text-theme-text-strong",
                    codeClassName,
                )}
            >
                <code>{code}</code>
            </pre>
        </div>
    );
};
