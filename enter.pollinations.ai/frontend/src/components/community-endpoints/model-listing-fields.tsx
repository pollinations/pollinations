import {
    ButtonGroup,
    CheckIcon,
    Field,
    InlineLink,
    Input,
    TabButton,
    Textarea,
} from "@pollinations/ui";
import {
    COMMUNITY_ENDPOINT_DESCRIPTION_MAX_LENGTH,
    COMMUNITY_ENDPOINT_TITLE_MAX_LENGTH,
} from "@shared/community-endpoints.ts";
import type { ReactElement, ReactNode } from "react";
import { ModelFormRow } from "./model-form-row.tsx";
import type { ModelListingFormState } from "./types.ts";

function ListingInputRow({
    label,
    help,
    action,
    optional = false,
    multiline = false,
    children,
}: {
    label: string;
    help?: ReactNode;
    action?: ReactNode;
    optional?: boolean;
    multiline?: boolean;
    children: ReactElement;
}) {
    const input = multiline ? (
        <Field.Textarea asChild>{children}</Field.Textarea>
    ) : (
        <Field.Input asChild>{children}</Field.Input>
    );
    return (
        <ModelFormRow
            label={label}
            help={help}
            optional={optional}
            action={action}
        >
            {input}
        </ModelFormRow>
    );
}

export function ModelListingFields({
    form,
    canPublish,
    isAgent,
    hideIdentity = false,
    required = true,
    onChange,
}: {
    form: ModelListingFormState;
    canPublish: boolean;
    isAgent: boolean;
    hideIdentity?: boolean;
    required?: boolean;
    onChange: (
        key: "name" | "title" | "description" | "visibility",
        value: string,
    ) => void;
}) {
    const isPublic = form.visibility === "public";
    const visibilityHelp = isPublic
        ? isAgent
            ? "Listed in /models. Calls use the caller's Pollen and API permissions."
            : "Listed in /models. Set prices below, or leave them at 0 for free."
        : canPublish
          ? "Only you can use it."
          : "Only you can use it. Public publishing requires approval.";
    const visibilityOptions = (
        <ButtonGroup aria-label="Model visibility">
            <TabButton
                active={!isPublic}
                onClick={() => onChange("visibility", "private")}
                size="sm"
                className="min-w-24 gap-1.5"
            >
                {!isPublic && <CheckIcon className="h-3.5 w-3.5" />}
                Private
            </TabButton>
            <TabButton
                active={isPublic}
                disabled={!canPublish}
                onClick={() => onChange("visibility", "public")}
                size="sm"
                className="min-w-24 gap-1.5"
            >
                {isPublic && <CheckIcon className="h-3.5 w-3.5" />}
                Public
            </TabButton>
        </ButtonGroup>
    );
    return (
        <div className="space-y-3">
            {!hideIdentity && (
                <>
                    <div className="space-y-3">
                        <ListingInputRow
                            label={isAgent ? "ID" : "Model ID"}
                            help={
                                isAgent
                                    ? "Public ID: {username}/{id}."
                                    : "Public ID: {username}/{model-id}."
                            }
                            action={
                                !isAgent && (
                                    <InlineLink
                                        href="https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_MODEL.md#model-names"
                                        size="sm"
                                    >
                                        Naming tips
                                    </InlineLink>
                                )
                            }
                        >
                            <Input
                                name="community-model-name"
                                value={form.name}
                                placeholder={isAgent ? "my-agent" : "my-model"}
                                autoComplete="off"
                                autoCapitalize="none"
                                spellCheck={false}
                                required={required}
                                className="w-full min-w-0"
                                onChange={(event) =>
                                    onChange("name", event.target.value)
                                }
                            />
                        </ListingInputRow>
                        <ListingInputRow label="Title">
                            <Input
                                name="community-model-title"
                                value={form.title}
                                placeholder={isAgent ? "My Agent" : "My Model"}
                                autoComplete="off"
                                maxLength={COMMUNITY_ENDPOINT_TITLE_MAX_LENGTH}
                                required={required}
                                className="w-full min-w-0"
                                onChange={(event) =>
                                    onChange("title", event.target.value)
                                }
                            />
                        </ListingInputRow>
                    </div>

                    <ListingInputRow
                        label="Description"
                        help={
                            isAgent
                                ? "A short summary of what the agent does."
                                : "What the model does."
                        }
                        optional
                        multiline={isAgent}
                    >
                        {isAgent ? (
                            <Textarea
                                name="community-model-description"
                                value={form.description}
                                placeholder="Research assistant with web tools"
                                rows={1}
                                style={{ minHeight: "2.625rem" }}
                                autoComplete="off"
                                maxLength={
                                    COMMUNITY_ENDPOINT_DESCRIPTION_MAX_LENGTH
                                }
                                className="w-full min-w-0"
                                onChange={(event) =>
                                    onChange("description", event.target.value)
                                }
                            />
                        ) : (
                            <Input
                                name="community-model-description"
                                value={form.description}
                                placeholder="Fast coding model, long context"
                                className="w-full min-w-0"
                                autoComplete="off"
                                maxLength={
                                    COMMUNITY_ENDPOINT_DESCRIPTION_MAX_LENGTH
                                }
                                onChange={(event) =>
                                    onChange("description", event.target.value)
                                }
                            />
                        )}
                    </ListingInputRow>
                </>
            )}

            <ModelFormRow label="Visibility" help={visibilityHelp}>
                {visibilityOptions}
            </ModelFormRow>
        </div>
    );
}
