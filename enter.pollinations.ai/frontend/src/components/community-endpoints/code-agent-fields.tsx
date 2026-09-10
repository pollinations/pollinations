import { FieldStack, Input } from "@pollinations/ui";
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
        <FieldStack
            label="GitHub repository"
            helper="Public repository with agent.ts at its root."
            alignLabelRow
        >
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
                onChange={(event) => onChange("repository", event.target.value)}
            />
        </FieldStack>
    );
}
