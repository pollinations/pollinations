import { InlineLink } from "@pollinations/ui";
import { CopyValue } from "./models/copy-value.tsx";

/** The polli command that does what a dashboard page does. */
export function CliHint({ command }: { command: string }) {
    return (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 text-micro text-theme-text-muted sm:px-0">
            <span>CLI</span>
            <CopyValue
                value={`polli ${command}`}
                label="Copy CLI command"
                showCopyIcon
            />
            <span aria-hidden="true">·</span>
            <InlineLink href="https://gen.pollinations.ai/docs#tag/cli">
                CLI docs
            </InlineLink>
        </div>
    );
}
