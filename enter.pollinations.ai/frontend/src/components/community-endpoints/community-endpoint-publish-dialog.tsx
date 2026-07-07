import {
    Alert,
    Button,
    Dialog,
    DialogTitle,
    FieldStack,
    IconButton,
    Input,
    ScrollArea,
    XIcon,
} from "@pollinations/ui";
import { COMMUNITY_ENDPOINT_PRICE_FIELDS } from "@shared/community-endpoints.ts";
import { COMMUNITY_TOOL_NAME_PATTERN } from "@shared/registry/community-billing.ts";
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
    type ToolFeeRow,
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

function isValidToolFeeRow(row: ToolFeeRow): boolean {
    const price = Number(row.price.trim());
    return (
        COMMUNITY_TOOL_NAME_PATTERN.test(row.name.trim()) &&
        Number.isFinite(price) &&
        price > 0
    );
}

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

    function updateToolFee(
        index: number,
        key: keyof ToolFeeRow,
        value: string,
    ): void {
        setForm((current) =>
            current
                ? {
                      ...current,
                      toolFees: current.toolFees.map((row, i) =>
                          i === index ? { ...row, [key]: value } : row,
                      ),
                  }
                : current,
        );
    }

    function addToolFee(): void {
        setForm((current) =>
            current
                ? {
                      ...current,
                      toolFees: [...current.toolFees, { name: "", price: "" }],
                  }
                : current,
        );
    }

    function removeToolFee(index: number): void {
        setForm((current) =>
            current
                ? {
                      ...current,
                      toolFees: current.toolFees.filter((_, i) => i !== index),
                  }
                : current,
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
    const hasValidToolFees = !!form && form.toolFees.every(isValidToolFeeRow);
    const canSubmit =
        !isSubmitting &&
        hasRequiredPrices &&
        hasValidPrices &&
        hasValidToolFees;

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

                            <FieldStack
                                label="Tool fees"
                                helper="Pollen charged per tool call, billed from the usage.tool_call_counts your endpoint reports (e.g. web_search)."
                                alignLabelRow
                                action={
                                    <Button
                                        type="button"
                                        size="sm"
                                        intent="info"
                                        className="shrink-0 text-sm"
                                        onClick={addToolFee}
                                    >
                                        Add tool fee
                                    </Button>
                                }
                            >
                                {form.toolFees.length > 0 && (
                                    <div className="grid gap-2">
                                        {form.toolFees.map((row, index) => (
                                            <div
                                                // biome-ignore lint/suspicious/noArrayIndexKey: rows have no stable id until named
                                                key={index}
                                                className="flex items-center gap-2"
                                            >
                                                <Input
                                                    name={`publish-tool-fee-name-${index}`}
                                                    value={row.name}
                                                    placeholder="web_search"
                                                    autoComplete="off"
                                                    autoCapitalize="none"
                                                    spellCheck={false}
                                                    className="flex-1"
                                                    onChange={(e) =>
                                                        updateToolFee(
                                                            index,
                                                            "name",
                                                            e.target.value,
                                                        )
                                                    }
                                                />
                                                <Input
                                                    name={`publish-tool-fee-price-${index}`}
                                                    value={row.price}
                                                    placeholder="0.005"
                                                    inputMode="decimal"
                                                    autoComplete="off"
                                                    className="w-32"
                                                    onChange={(e) =>
                                                        updateToolFee(
                                                            index,
                                                            "price",
                                                            e.target.value,
                                                        )
                                                    }
                                                />
                                                <IconButton
                                                    intent="danger"
                                                    title="Remove tool fee"
                                                    tooltip="Remove tool fee"
                                                    onClick={() =>
                                                        removeToolFee(index)
                                                    }
                                                >
                                                    <XIcon className="h-4 w-4" />
                                                </IconButton>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </FieldStack>
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
