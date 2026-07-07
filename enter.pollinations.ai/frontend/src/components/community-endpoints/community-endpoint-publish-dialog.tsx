import {
    Alert,
    Button,
    Dialog,
    DialogTitle,
    FieldStack,
    Input,
    ScrollArea,
} from "@pollinations/ui";
import { COMMUNITY_ENDPOINT_PRICE_FIELDS } from "@shared/community-endpoints.ts";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import {
    hasPositivePriceInput,
    hasValidVisibleFormPrices,
    type PriceFieldKey,
    PriceGroups,
} from "./price-table.tsx";
import {
    type CommunityEndpoint,
    type EndpointFormState,
    endpointToForm,
    idleAction,
    nextFormState,
    type PublishPayload,
    toPublishPayload,
} from "./types.ts";

// Publishing requires positive base text pricing so public callers are never
// billed zero; other buckets are optional. Mirrors the backend
// REQUIRED_SHARED_PRICE_KEYS.
const REQUIRED_PUBLISH_PRICE_KEYS: PriceFieldKey[] = [
    "promptTextPrice",
    "completionTextPrice",
];

// All price fields are shown at publish time — there is no live test to reveal
// which buckets the endpoint bills, so the owner declares them directly.
const PUBLISH_PRICE_KEYS = new Set<PriceFieldKey>(
    COMMUNITY_ENDPOINT_PRICE_FIELDS.map((field) => field.key),
);

type CommunityEndpointPublishDialogProps = {
    endpoint: CommunityEndpoint | null;
    onOpenChange: (open: boolean) => void;
    onSubmit: (
        endpoint: CommunityEndpoint,
        payload: PublishPayload,
    ) => Promise<void>;
};

export function CommunityEndpointPublishDialog({
    endpoint,
    onOpenChange,
    onSubmit,
}: CommunityEndpointPublishDialogProps) {
    const [form, setForm] = useState<EndpointFormState | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setForm(endpoint ? endpointToForm(endpoint) : null);
        setError(null);
        setIsSubmitting(false);
    }, [endpoint]);

    function updateForm(key: keyof EndpointFormState, value: string): void {
        setForm((current) =>
            current ? nextFormState(current, key, value) : current,
        );
    }

    async function handleSubmit(event: FormEvent): Promise<void> {
        event.preventDefault();
        if (!endpoint || !form) return;
        setIsSubmitting(true);
        setError(null);
        try {
            await onSubmit(endpoint, toPublishPayload("public", form));
            onOpenChange(false);
        } catch (thrown) {
            setError(
                thrown instanceof Error ? thrown.message : "Publish failed",
            );
        } finally {
            setIsSubmitting(false);
        }
    }

    const hasRequiredPrices =
        !!form &&
        COMMUNITY_ENDPOINT_PRICE_FIELDS.filter((field) =>
            REQUIRED_PUBLISH_PRICE_KEYS.includes(field.key),
        ).every((field) => hasPositivePriceInput(form, field));
    const hasValidPrices =
        !!form && hasValidVisibleFormPrices(form, PUBLISH_PRICE_KEYS);
    const canSubmit = !isSubmitting && hasRequiredPrices && hasValidPrices;

    return (
        <Dialog
            open={!!endpoint}
            onOpenChange={onOpenChange}
            size="lg"
            contentClassName="flex max-h-[calc(100dvh-2rem)] flex-col"
        >
            <div className="shrink-0 p-6 pb-4">
                <DialogTitle className="text-lg font-semibold">
                    Make Public
                </DialogTitle>
                <p className="mt-1 text-sm text-theme-text-muted">
                    Publish <code>{endpoint?.modelId}</code> to the public model
                    catalog. It becomes callable by anyone and billed to callers
                    at your per-1M-token pricing. Requires an allowlisted
                    account.
                </p>
            </div>

            <form
                onSubmit={handleSubmit}
                className="flex min-h-0 flex-1 flex-col"
                autoComplete="off"
            >
                <ScrollArea className="min-h-0 flex-1 space-y-4 overscroll-contain px-6 pb-2">
                    {error && <Alert intent="danger">{error}</Alert>}

                    {form && (
                        <>
                            <FieldStack
                                label="Description"
                                helper="Shown in the public Models list."
                                alignLabelRow
                            >
                                <Input
                                    name="publish-description"
                                    value={form.description}
                                    placeholder="Fast coding model, long context"
                                    autoComplete="off"
                                    maxLength={240}
                                    onChange={(e) =>
                                        updateForm(
                                            "description",
                                            e.target.value,
                                        )
                                    }
                                />
                            </FieldStack>

                            <PriceGroups
                                form={form}
                                testState={idleAction}
                                visiblePriceKeys={PUBLISH_PRICE_KEYS}
                                onChange={updateForm}
                            />
                        </>
                    )}
                </ScrollArea>

                <div className="flex shrink-0 justify-end gap-2 p-6 pt-4">
                    <Button
                        type="button"
                        className="disabled:opacity-50"
                        onClick={() => onOpenChange(false)}
                        disabled={isSubmitting}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        className="disabled:opacity-50"
                        disabled={!canSubmit}
                    >
                        {isSubmitting ? "Publishing…" : "Make Public"}
                    </Button>
                </div>
            </form>
        </Dialog>
    );
}
