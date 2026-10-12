import {
    CheckIcon,
    Field,
    GitBranchIcon,
    InlineLink,
    Input,
} from "@pollinations/ui";
import type { ReactNode } from "react";
import { ModelFormRow } from "./model-form-row.tsx";
import type { AgentFormState } from "./types.ts";

type CodeAgentFieldsProps = {
    form: Pick<AgentFormState, "repository">;
    disabled: boolean;
    onChange: (field: "repository", value: string) => void;
    /** Editing a deployed agent: its commit and sync control replace the fork link. */
    deployment?: { commitSha: string; synced: boolean; sync: ReactNode };
};

export function CodeAgentFields({
    form,
    disabled,
    onChange,
    deployment,
}: CodeAgentFieldsProps) {
    return (
        <ModelFormRow
            label="GitHub repository"
            help="Public repository with agent.ts at its root. Its name becomes the model ID and title; its description becomes the catalog description. Private code agents coming soon."
            action={deployment?.sync}
            note={
                deployment ? (
                    <output className="flex items-center gap-1.5 font-body text-xs text-theme-text-muted">
                        {deployment.synced ? (
                            <CheckIcon className="h-3.5 w-3.5 shrink-0" />
                        ) : (
                            <GitBranchIcon className="h-3.5 w-3.5 shrink-0" />
                        )}
                        {deployment.synced ? "Synced to" : "Deployed"}{" "}
                        <code className="font-mono">
                            {deployment.commitSha.slice(0, 7)}
                        </code>
                    </output>
                ) : (
                    <InlineLink
                        href="https://github.com/orgs/pollinations/repositories?q=topic%3Apollinations-code-agent-example"
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs"
                    >
                        Fork an example
                    </InlineLink>
                )
            }
        >
            <Field.Input asChild>
                <Input
                    name="code-agent-repository"
                    type="url"
                    value={form.repository}
                    placeholder="https://github.com/your-name/your-agent"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                    disabled={disabled}
                    className="w-full min-w-0"
                    onChange={(event) =>
                        onChange("repository", event.target.value)
                    }
                />
            </Field.Input>
        </ModelFormRow>
    );
}
