import { Field, InfoTip, InlineLink, Textarea } from "@pollinations/ui";
import { AuthAccessItem } from "@pollinations/ui/auth";
import { MCP_SERVERS } from "@shared/registry/mcp.ts";
import { config } from "../../config.ts";
import { BaseModelInput } from "./base-model-input.tsx";
import { ModelFormRow } from "./model-form-row.tsx";
import type { AgentFormState } from "./types.ts";

type PromptAgentFieldsProps = {
    form: AgentFormState;
    disabled: boolean;
    onChange: (
        key: keyof AgentFormState,
        value: string | AgentFormState["mcpServers"],
    ) => void;
};

export function PromptAgentFields({
    form,
    disabled,
    onChange,
}: PromptAgentFieldsProps) {
    return (
        <div className="space-y-3">
            <ModelFormRow
                label="Base model"
                help="Choose a Pollinations text model or enter its ID. Accepted inputs are inherited from this model."
            >
                <BaseModelInput
                    value={form.baseModel}
                    disabled={disabled}
                    onChange={(value) => onChange("baseModel", value)}
                />
            </ModelFormRow>
            <ModelFormRow
                label="System prompt"
                help="Sent on every call. Users may extract these instructions; do not include credentials, personal data, or confidential information."
            >
                <Field.Textarea asChild>
                    <Textarea
                        name="prompt-agent-system-prompt"
                        value={form.systemPrompt}
                        placeholder="You are a helpful assistant that…"
                        rows={1}
                        style={{ minHeight: "2.625rem" }}
                        maxLength={8000}
                        disabled={disabled}
                        onChange={(e) =>
                            onChange("systemPrompt", e.target.value)
                        }
                    />
                </Field.Textarea>
            </ModelFormRow>
        </div>
    );
}

export function PromptAgentTools({
    form,
    disabled,
    onChange,
}: PromptAgentFieldsProps) {
    return (
        <div className="space-y-3">
            <div className="flex items-center">
                <p className="font-body text-sm font-semibold leading-5 text-theme-text-strong">
                    Tools
                </p>
                <InfoTip
                    text="Selected tools are available to this agent. Some may spend Pollen or need a connected account."
                    label="Tools information"
                />
            </div>
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
                        info={
                            <InfoTip
                                text={server.description}
                                label={`${server.name} MCP information`}
                            />
                        }
                        details={
                            "accountPath" in server && (
                                <InlineLink
                                    href={`${config.baseUrl}${server.accountPath}`}
                                >
                                    Connect apps
                                </InlineLink>
                            )
                        }
                    >
                        {server.name} MCP
                    </AuthAccessItem>
                ))}
            </ul>
        </div>
    );
}
