import type { ComponentPropsWithoutRef, FC } from "react";
import { cn } from "../lib/cn.ts";
import { ScrollArea } from "../primitives/ScrollArea.tsx";

type CodeBlockOwnProps = {
    code: string;
    codeClassName?: string;
};

export type CodeBlockProps = CodeBlockOwnProps &
    Omit<ComponentPropsWithoutRef<"div">, keyof CodeBlockOwnProps | "children">;

export const CodeBlock: FC<CodeBlockProps> = ({
    code,
    codeClassName,
    className,
    ...rest
}) => (
    <ScrollArea
        {...rest}
        axis="x"
        className={cn(
            "polli:rounded-lg polli:border polli:border-theme-border polli:bg-theme-bg-pale",
            className,
        )}
    >
        <pre
            className={cn(
                "polli:p-4 polli:font-mono polli:text-xs polli:leading-6 polli:text-theme-text-strong",
                codeClassName,
            )}
        >
            <code>{code}</code>
        </pre>
    </ScrollArea>
);
