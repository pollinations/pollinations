import { Field, InlineLink, Input } from "@pollinations/ui";
import { AgentFormRow } from "./agent-form-row.tsx";
import type { AgentFormState } from "./types.ts";

type CodeAgentFieldsProps = {
    form: Pick<AgentFormState, "repository">;
    disabled: boolean;
    onChange: (field: "repository", value: string) => void;
};

export function CodeAgentFields({
    form,
    disabled,
    onChange,
}: CodeAgentFieldsProps) {
    return (
        <AgentFormRow
            label="GitHub repository"
            help="Public repository with agent.ts at its root. Its name becomes the model ID and title; its description becomes the catalog description. Private code agents coming soon."
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
            <div className="mt-2 flex justify-end">
                <InlineLink
                    href="https://github.com/orgs/pollinations/repositories?q=topic%3Apollinations-code-agent-example"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs"
                >
                    Fork an example
                </InlineLink>
            </div>
        </AgentFormRow>
    );
}
