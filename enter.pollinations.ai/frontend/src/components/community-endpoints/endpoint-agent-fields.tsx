import { FieldStack, Input } from "@pollinations/ui";
import type { AgentFormState } from "./types.ts";

export function EndpointAgentFields({
    form,
    disabled,
    onChange,
}: {
    form: AgentFormState;
    disabled: boolean;
    onChange: (key: keyof AgentFormState, value: string) => void;
}) {
    return (
        <div className="space-y-4">
            <FieldStack
                label="Endpoint"
                helper="OpenAI-compatible /v1 base URL or full chat completions URL of the server you run."
                alignLabelRow
            >
                <Input
                    type="url"
                    name="endpoint-agent-base-url"
                    value={form.baseUrl}
                    placeholder="https://api.example.com/v1"
                    disabled={disabled}
                    onChange={(e) => onChange("baseUrl", e.target.value)}
                />
            </FieldStack>

            <FieldStack
                label="Upstream model"
                helper="Sent as the OpenAI model value. Leave empty to send the model ID above."
                alignLabelRow
            >
                <Input
                    name="endpoint-agent-upstream-model"
                    value={form.upstreamModel}
                    placeholder="Model ID above"
                    maxLength={253}
                    disabled={disabled}
                    onChange={(e) => onChange("upstreamModel", e.target.value)}
                />
            </FieldStack>

            <p className="text-xs text-theme-text-muted">
                Your server is called with a short-lived agent run token as the
                bearer, billed to whoever called the agent — so it needs no
                stored credential, and agent listings are always free. Verify
                the token against{" "}
                <code className="font-mono">/account/key</code>.
            </p>
        </div>
    );
}
