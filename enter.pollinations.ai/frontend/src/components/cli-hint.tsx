import { CopyButton, InlineLink } from "@pollinations/ui";
import { CopyValue } from "./models/copy-value.tsx";

const SKILL_URL = "https://gen.pollinations.ai/docs/polli-skill.md";

/**
 * The polli command that does what a dashboard page does, and the same task
 * as a one-line prompt for a coding agent. The prompt points at the hosted
 * skill file, so it stays current with the CLI and never carries a key.
 */
export function CliHint({ command, task }: { command: string; task: string }) {
    const prompt = `Install the Pollinations CLI (npm i -g @pollinations/cli), follow ${SKILL_URL}, then ${task}: polli ${command}`;
    return (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 text-micro text-theme-text-muted sm:px-0">
            <span>CLI</span>
            <CopyValue
                value={`polli ${command}`}
                label="Copy CLI command"
                showCopyIcon
            />
            <span aria-hidden="true">·</span>
            <CopyButton
                value={prompt}
                tooltip={null}
                className="hover:text-theme-text-soft"
            >
                {(copied) => (copied ? "Copied" : "Copy for your agent")}
            </CopyButton>
            <span aria-hidden="true">·</span>
            <InlineLink href="https://gen.pollinations.ai/docs#tag/cli">
                CLI docs
            </InlineLink>
        </div>
    );
}
