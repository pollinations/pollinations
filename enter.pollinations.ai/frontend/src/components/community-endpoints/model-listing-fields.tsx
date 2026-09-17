import {
    ButtonGroup,
    CheckIcon,
    Field,
    FieldStack,
    InlineLink,
    Input,
    TabButton,
} from "@pollinations/ui";
import {
    COMMUNITY_ENDPOINT_DESCRIPTION_MAX_LENGTH,
    COMMUNITY_ENDPOINT_TITLE_MAX_LENGTH,
} from "@shared/community-endpoints.ts";
import type { ModelListingFormState } from "./types.ts";
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
    return (
        <div className="space-y-3">
            {!hideIdentity && (
                <>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <FieldStack
                            label={isAgent ? "ID" : "Model ID"}
                            helper={
                                isAgent ? (
                                    "Public ID: {username}/{id}."
                                ) : (
                                    <>
                                        Public ID: {"{username}"}/{"{model-id}"}
                                        .{" "}
                                        <InlineLink
                                            href="https://github.com/pollinations/pollinations/blob/main/BRING_YOUR_OWN_MODEL.md#model-names"
                                            target="_blank"
                                            rel="noreferrer"
                                        >
                                            Naming tips
                                        </InlineLink>
                                        .
                                    </>
                                )
                            }
                        >
                            <Field.Input asChild>
                                <Input
                                    name="community-model-name"
                                    value={form.name}
                                    placeholder={
                                        isAgent ? "my-agent" : "my-model"
                                    }
                                    autoComplete="off"
                                    autoCapitalize="none"
                                    spellCheck={false}
                                    required={required}
                                    onChange={(event) =>
                                        onChange("name", event.target.value)
                                    }
                                />
                            </Field.Input>
                        </FieldStack>
                        <FieldStack label="Title">
                            <Field.Input asChild>
                                <Input
                                    name="community-model-title"
                                    value={form.title}
                                    placeholder={
                                        isAgent ? "My Agent" : "My Model"
                                    }
                                    autoComplete="off"
                                    maxLength={
                                        COMMUNITY_ENDPOINT_TITLE_MAX_LENGTH
                                    }
                                    required={required}
                                    onChange={(event) =>
                                        onChange("title", event.target.value)
                                    }
                                />
                            </Field.Input>
                        </FieldStack>
                    </div>

                    <FieldStack
                        label="Description"
                        helper={
                            isAgent
                                ? "Optional. What the agent does."
                                : "Optional. What the model does."
                        }
                    >
                        <Field.Input asChild>
                            <Input
                                name="community-model-description"
                                value={form.description}
                                placeholder={
                                    isAgent
                                        ? "Research assistant with web tools"
                                        : "Fast coding model, long context"
                                }
                                autoComplete="off"
                                maxLength={
                                    COMMUNITY_ENDPOINT_DESCRIPTION_MAX_LENGTH
                                }
                                onChange={(event) =>
                                    onChange("description", event.target.value)
                                }
                            />
                        </Field.Input>
                    </FieldStack>
                </>
            )}

            <FieldStack
                label="Visibility"
                helper={
                    isPublic
                        ? isAgent
                            ? "Listed in /models. Calls use the caller's Pollen and API permissions."
                            : "Listed in /models. Set prices below, or leave them at 0 for free."
                        : canPublish
                          ? "Only you can use it."
                          : "Only you can use it. Public publishing requires approval."
                }
            >
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
            </FieldStack>
        </div>
    );
}
