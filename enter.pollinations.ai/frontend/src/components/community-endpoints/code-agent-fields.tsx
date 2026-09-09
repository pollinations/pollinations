import { FieldStack, Input } from "@pollinations/ui";
import type { AgentFormState } from "./types.ts";

type CodeAgentFieldsProps = {
    form: Pick<AgentFormState, "repository" | "directory">;
    disabled: boolean;
    onChange: (field: "repository" | "directory", value: string) => void;
};

export function CodeAgentFields({
    form,
    disabled,
    onChange,
}: CodeAgentFieldsProps) {
    return (
        <div className="space-y-4">
            <FieldStack
                label="GitHub repository"
                helper="Public repository containing agent.js."
                alignLabelRow
            >
                <Input
                    name="code-agent-repository"
                    type="url"
                    value={form.repository}
                    placeholder="https://github.com/your-name/your-agents"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                    disabled={disabled}
                    onChange={(event) =>
                        onChange("repository", event.target.value)
                    }
                />
            </FieldStack>
            <FieldStack
                label="Directory"
                helper="Optional folder containing agent.js. Leave empty for the repository root."
                alignLabelRow
            >
                <Input
                    name="code-agent-directory"
                    value={form.directory}
                    placeholder="agents/research"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    disabled={disabled}
                    onChange={(event) =>
                        onChange("directory", event.target.value)
                    }
                />
            </FieldStack>
        </div>
    );
}
