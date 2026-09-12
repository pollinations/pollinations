import {
    Field,
    FieldStack,
    InlineLink,
    Text,
    Textarea,
} from "@pollinations/ui";
import { AuthAccessItem, AuthInfoCard } from "@pollinations/ui/auth";
import { MCP_SERVERS } from "@shared/registry/mcp.ts";
import { config } from "../../config.ts";
import { BaseModelInput } from "./base-model-input.tsx";
import type { AgentFormState } from "./types.ts";

export function PromptAgentFields({
    form,
    disabled,
    onChange,
}: {
    form: AgentFormState;
    disabled: boolean;
    onChange: (
        key: keyof AgentFormState,
        value: string | AgentFormState["mcpServers"],
    ) => void;
}) {
    return (
        <>
            <AuthInfoCard title={null}>
                <FieldStack
                    label="System prompt"
                    helper="Sent on every call. Users may extract these instructions; do not include credentials, personal data, or confidential information."
                >
                    <Field.Textarea asChild>
                        <Textarea
                            name="prompt-agent-system-prompt"
                            value={form.systemPrompt}
                            placeholder="You are a helpful assistant that…"
                            rows={6}
                            maxLength={8000}
                            disabled={disabled}
                            onChange={(e) =>
                                onChange("systemPrompt", e.target.value)
                            }
                        />
                    </Field.Textarea>
                </FieldStack>
            </AuthInfoCard>
            <AuthInfoCard title={null}>
                <FieldStack
                    label="Base model"
                    helper="Choose a Pollinations text model or enter its ID. Accepted inputs are inherited from this model."
                >
                    <BaseModelInput
                        value={form.baseModel}
                        disabled={disabled}
                        onChange={(value) => onChange("baseModel", value)}
                    />
                </FieldStack>
            </AuthInfoCard>
            <AuthInfoCard title="Tools">
                <ul className="space-y-3">
                    {MCP_SERVERS.map((server) => (
                        <AuthAccessItem
                            key={server.id}
                            checked={form.mcpServers.includes(server.id)}
                            disabled={disabled}
                            ariaLabel={`Allow ${server.name} tools`}
                            onChange={(selected) =>
                                onChange(
                                    "mcpServers",
                                    selected
                                        ? [...form.mcpServers, server.id]
                                        : form.mcpServers.filter(
                                              (id) => id !== server.id,
                                          ),
                                )
                            }
                            details={
                                <Text size="xs" tone="muted">
                                    {server.description}{" "}
                                    {"accountPath" in server && (
                                        <InlineLink
                                            href={`${config.baseUrl}${server.accountPath}`}
                                        >
                                            Manage connectors
                                        </InlineLink>
                                    )}
                                </Text>
                            }
                        >
                            {server.name} MCP
                        </AuthAccessItem>
                    ))}
                </ul>
            </AuthInfoCard>
        </>
    );
}
