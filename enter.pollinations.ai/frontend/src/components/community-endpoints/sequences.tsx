import {
    Alert,
    Button,
    ChevronIcon,
    Dialog,
    DialogFooter,
    DialogHeader,
    Dropdown,
    DropdownItem,
    FieldStack,
    Input,
    ScrollArea,
    Section,
    SparklesIcon,
    Surface,
} from "@pollinations/ui";
import {
    MODEL_SEQUENCE_DESCRIPTION_MAX_LENGTH,
    MODEL_SEQUENCE_MAX_MODELS,
    MODEL_SEQUENCE_NAME_MAX_LENGTH,
    MODEL_SEQUENCE_NAME_REGEX,
    MODEL_SEQUENCE_TITLE_MAX_LENGTH,
} from "@shared/model-sequences.ts";
import {
    type FormEvent,
    type ReactNode,
    useCallback,
    useEffect,
    useState,
} from "react";
import { apiClient } from "../../api.ts";
import { readError } from "./types.ts";

// A catalog model that can join a sequence: static or community, never an
// agent (agents delegate generation and cannot be fallback targets).
export type SequenceModelOption = {
    modelId: string;
    type: string;
};

type ModelSequence = {
    id: string;
    modelId: string;
    name: string;
    title: string;
    description: string | null;
    modelIds: string[];
    createdAt: string;
    updatedAt: string;
};

type SequenceFormState = {
    name: string;
    title: string;
    description: string;
    modelIds: string[];
};

function sequenceToForm(sequence?: ModelSequence): SequenceFormState {
    return {
        name: sequence?.name ?? "",
        title: sequence?.title ?? "",
        description: sequence?.description ?? "",
        modelIds: sequence ? [...sequence.modelIds] : [],
    };
}

type SequenceDialogProps = {
    sequence?: ModelSequence;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (form: SequenceFormState) => Promise<void>;
    modelOptions: SequenceModelOption[];
    trigger?: ReactNode;
};

function SequenceDialog({
    sequence,
    open,
    onOpenChange,
    onSubmit,
    modelOptions,
    trigger,
}: SequenceDialogProps) {
    const isEdit = !!sequence;
    const [form, setForm] = useState(() => sequenceToForm(sequence));
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setForm(sequenceToForm(open ? sequence : undefined));
        setError(null);
        setIsSubmitting(false);
    }, [open, sequence]);

    // Options already chosen stay selectable in their own row; the rest are
    // hidden from other rows so a model cannot be picked twice.
    function optionsForRow(current: string): SequenceModelOption[] {
        return modelOptions.filter(
            (option) =>
                option.modelId === current ||
                !form.modelIds.includes(option.modelId),
        );
    }

    function setModelAt(index: number, modelId: string): void {
        setForm((currentForm) => {
            const next = [...currentForm.modelIds];
            if (modelId === "") next.splice(index, 1);
            else next[index] = modelId;
            return { ...currentForm, modelIds: next };
        });
    }

    function moveModel(index: number, delta: number): void {
        setForm((currentForm) => {
            const target = index + delta;
            if (target < 0 || target >= currentForm.modelIds.length) {
                return currentForm;
            }
            const next = [...currentForm.modelIds];
            [next[index], next[target]] = [next[target], next[index]];
            return { ...currentForm, modelIds: next };
        });
    }

    // One row per chosen model plus an empty row to add the next, so the
    // order on screen is the order the gateway tries them.
    const rows =
        form.modelIds.length < MODEL_SEQUENCE_MAX_MODELS
            ? [...form.modelIds, ""]
            : form.modelIds;

    async function handleSubmit(event: FormEvent): Promise<void> {
        event.preventDefault();
        setIsSubmitting(true);
        setError(null);
        try {
            await onSubmit(form);
            onOpenChange(false);
        } catch (thrown) {
            setError(
                thrown instanceof Error
                    ? thrown.message
                    : "Sequence save failed",
            );
        } finally {
            setIsSubmitting(false);
        }
    }

    const canSubmit =
        !isSubmitting &&
        form.title.trim() !== "" &&
        form.modelIds.length >= 2 &&
        (isEdit ||
            (form.name.trim() !== "" &&
                MODEL_SEQUENCE_NAME_REGEX.test(form.name.trim())));

    return (
        <Dialog
            open={open}
            onOpenChange={onOpenChange}
            size="lg"
            trigger={trigger}
            triggerAsChild
            contentClassName="flex max-h-[calc(100dvh-2rem)] flex-col"
        >
            <DialogHeader
                title={isEdit ? "Edit Sequence" : "Add Sequence"}
                description={
                    <>
                        A sequence answers as{" "}
                        <code>
                            {"{username}"}/{"{name}"}
                        </code>{" "}
                        and bills the primary model's price. When the primary
                        fails, fallbacks are tried in order.
                    </>
                }
            />
            <form
                onSubmit={handleSubmit}
                className="flex min-h-0 flex-1 flex-col"
                autoComplete="off"
            >
                <ScrollArea className="min-h-0 flex-1 overscroll-contain px-6 pb-2">
                    <div className="flex flex-col gap-4">
                        {error && <Alert intent="danger">{error}</Alert>}
                        <div className="grid gap-4 sm:grid-cols-2">
                            {!isEdit && (
                                <FieldStack
                                    label="Name"
                                    helper={`Letters, numbers and . _ : - (max ${MODEL_SEQUENCE_NAME_MAX_LENGTH}).`}
                                >
                                    <Input
                                        name="sequence-name"
                                        value={form.name}
                                        placeholder="my-fallback-chain"
                                        maxLength={
                                            MODEL_SEQUENCE_NAME_MAX_LENGTH
                                        }
                                        onChange={(event) =>
                                            setForm((current) => ({
                                                ...current,
                                                name: event.target.value,
                                            }))
                                        }
                                    />
                                </FieldStack>
                            )}
                            <FieldStack
                                label="Title"
                                helper={`Shown in your model list (max ${MODEL_SEQUENCE_TITLE_MAX_LENGTH}).`}
                            >
                                <Input
                                    name="sequence-title"
                                    value={form.title}
                                    placeholder="Reliable chat"
                                    maxLength={MODEL_SEQUENCE_TITLE_MAX_LENGTH}
                                    onChange={(event) =>
                                        setForm((current) => ({
                                            ...current,
                                            title: event.target.value,
                                        }))
                                    }
                                />
                            </FieldStack>
                        </div>
                        <FieldStack
                            label="Description"
                            helper={`Optional (max ${MODEL_SEQUENCE_DESCRIPTION_MAX_LENGTH}).`}
                        >
                            <Input
                                name="sequence-description"
                                value={form.description}
                                maxLength={
                                    MODEL_SEQUENCE_DESCRIPTION_MAX_LENGTH
                                }
                                onChange={(event) =>
                                    setForm((current) => ({
                                        ...current,
                                        description: event.target.value,
                                    }))
                                }
                            />
                        </FieldStack>
                        <FieldStack
                            label="Models"
                            helper="The first model is the primary: it sets the price and modality. Fallbacks must not cost more than the primary."
                        >
                            <div className="flex flex-col gap-2">
                                {rows.map((selected, index) => (
                                    <div
                                        key={selected || "new-model"}
                                        className="flex items-center gap-2"
                                    >
                                        <Dropdown
                                            align="start"
                                            className="w-[var(--reference-width)] min-w-0 p-1"
                                            trigger={(dropdownOpen) => (
                                                <Button
                                                    type="button"
                                                    aria-label={`Model ${index + 1}: ${selected || "None"}`}
                                                    className="w-full min-w-0 flex-1 justify-between gap-2 self-stretch"
                                                >
                                                    <span className="min-w-0 truncate font-mono text-sm">
                                                        {selected ||
                                                            "Choose a model"}
                                                    </span>
                                                    <ChevronIcon
                                                        expanded={dropdownOpen}
                                                        className="h-4 w-4 shrink-0"
                                                    />
                                                </Button>
                                            )}
                                        >
                                            {(close) => (
                                                <ScrollArea className="max-h-64">
                                                    {selected && (
                                                        <DropdownItem
                                                            onClick={() => {
                                                                setModelAt(
                                                                    index,
                                                                    "",
                                                                );
                                                                close();
                                                            }}
                                                        >
                                                            None (remove)
                                                        </DropdownItem>
                                                    )}
                                                    {optionsForRow(
                                                        selected,
                                                    ).map((option) => (
                                                        <DropdownItem
                                                            key={option.modelId}
                                                            onClick={() => {
                                                                setModelAt(
                                                                    index,
                                                                    option.modelId,
                                                                );
                                                                close();
                                                            }}
                                                        >
                                                            <span className="font-mono text-sm">
                                                                {option.modelId}
                                                            </span>
                                                        </DropdownItem>
                                                    ))}
                                                </ScrollArea>
                                            )}
                                        </Dropdown>
                                        <span className="w-16 shrink-0 text-xs text-theme-text-muted">
                                            {index === 0
                                                ? "Primary"
                                                : `Fallback ${index}`}
                                        </span>
                                        <Button
                                            type="button"
                                            aria-label={`Move model ${index + 1} up`}
                                            disabled={index === 0}
                                            onClick={() => moveModel(index, -1)}
                                        >
                                            ↑
                                        </Button>
                                        <Button
                                            type="button"
                                            aria-label={`Move model ${index + 1} down`}
                                            disabled={
                                                index >=
                                                form.modelIds.length - 1
                                            }
                                            onClick={() => moveModel(index, 1)}
                                        >
                                            ↓
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </FieldStack>
                    </div>
                </ScrollArea>
                <DialogFooter>
                    <Button
                        type="button"
                        onClick={() => onOpenChange(false)}
                        disabled={isSubmitting}
                    >
                        Cancel
                    </Button>
                    <Button type="submit" intent="info" disabled={!canSubmit}>
                        {isEdit ? "Save Sequence" : "Add Sequence"}
                    </Button>
                </DialogFooter>
            </form>
        </Dialog>
    );
}

type SequencesProps = {
    onChange?: () => void | Promise<void>;
    // Catalog models offered as sequence members in the dialog. The server
    // re-validates event type and pricing on write.
    modelOptions: SequenceModelOption[];
};

export function Sequences({ onChange, modelOptions }: SequencesProps) {
    const [sequences, setSequences] = useState<ModelSequence[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [createOpen, setCreateOpen] = useState(false);
    const [editing, setEditing] = useState<ModelSequence | null>(null);
    const [deleting, setDeleting] = useState<ModelSequence | null>(null);

    const loadSequences = useCallback(async (): Promise<void> => {
        setError(null);
        const response = await apiClient.account["my-models"].sequences.$get();
        if (!response.ok) {
            setError(await readError(response));
            setIsLoading(false);
            return;
        }
        const body = (await response.json()) as { data: ModelSequence[] };
        setSequences(body.data);
        setIsLoading(false);
    }, []);

    useEffect(() => {
        void loadSequences();
    }, [loadSequences]);

    async function handleCreate(form: SequenceFormState): Promise<void> {
        const response = await apiClient.account["my-models"].sequences.$post({
            json: {
                name: form.name.trim(),
                title: form.title.trim(),
                description: form.description.trim() || undefined,
                modelIds: form.modelIds,
            },
        });
        if (!response.ok) throw new Error(await readError(response));
        await loadSequences();
        await onChange?.();
    }

    async function handleUpdate(form: SequenceFormState): Promise<void> {
        if (!editing) return;
        const response = await apiClient.account["my-models"].sequences[
            ":id"
        ].$put({
            param: { id: editing.id },
            json: {
                title: form.title.trim(),
                description: form.description.trim() || null,
                modelIds: form.modelIds,
            },
        });
        if (!response.ok) throw new Error(await readError(response));
        await loadSequences();
        await onChange?.();
    }

    async function handleDelete(): Promise<void> {
        if (!deleting) return;
        const target = deleting;
        setDeleting(null);
        setError(null);
        try {
            const response = await apiClient.account["my-models"].sequences[
                ":id"
            ].$delete({
                param: { id: target.id },
            });
            if (!response.ok) throw new Error(await readError(response));
            await loadSequences();
            await onChange?.();
        } catch (thrown) {
            setError(
                thrown instanceof Error
                    ? thrown.message
                    : "Sequence delete failed",
            );
        }
    }

    return (
        <>
            <Section
                title="Sequences"
                framed
                action={
                    <SequenceDialog
                        open={createOpen}
                        onOpenChange={setCreateOpen}
                        onSubmit={handleCreate}
                        modelOptions={modelOptions}
                        trigger={
                            <Button
                                type="button"
                                className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap"
                            >
                                <SparklesIcon className="h-4 w-4" />
                                Add Sequence
                            </Button>
                        }
                    />
                }
            >
                <div className="flex flex-col gap-3">
                    {error && <Alert intent="danger">{error}</Alert>}
                    {isLoading ? (
                        <Surface className="p-6 text-center text-sm text-theme-text-muted">
                            Loading…
                        </Surface>
                    ) : sequences.length === 0 ? (
                        <Surface className="p-6 text-center">
                            <SparklesIcon className="mx-auto mb-2 h-8 w-8 text-theme-text-muted" />
                            <p className="mb-2 text-lg font-semibold">
                                Create your first sequence
                            </p>
                            <p className="text-sm text-theme-text-muted">
                                Chain models so a fallback answers when the
                                primary fails, at the primary's price.
                            </p>
                        </Surface>
                    ) : (
                        sequences.map((sequence) => (
                            <Surface
                                key={sequence.id}
                                className="flex flex-col gap-2 p-4"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="truncate font-semibold">
                                            {sequence.title}
                                        </p>
                                        <p className="truncate font-mono text-sm text-theme-text-muted">
                                            {sequence.modelId}
                                        </p>
                                    </div>
                                    <div className="flex shrink-0 gap-2">
                                        <Button
                                            type="button"
                                            onClick={() => setEditing(sequence)}
                                        >
                                            Edit
                                        </Button>
                                        <Button
                                            type="button"
                                            intent="danger"
                                            onClick={() =>
                                                setDeleting(sequence)
                                            }
                                        >
                                            Delete
                                        </Button>
                                    </div>
                                </div>
                                <ol className="flex flex-col gap-1">
                                    {sequence.modelIds.map((modelId, index) => (
                                        <li
                                            key={modelId}
                                            className="flex items-baseline gap-2 text-sm"
                                        >
                                            <span className="w-20 shrink-0 text-xs text-theme-text-muted">
                                                {index === 0
                                                    ? "Primary"
                                                    : `Fallback ${index}`}
                                            </span>
                                            <span className="min-w-0 truncate font-mono">
                                                {modelId}
                                            </span>
                                        </li>
                                    ))}
                                </ol>
                                {sequence.description && (
                                    <p className="text-sm text-theme-text-muted">
                                        {sequence.description}
                                    </p>
                                )}
                            </Surface>
                        ))
                    )}
                </div>
                {!isLoading && (
                    <p className="mt-4 border-t border-divider pt-4 text-[13px] leading-snug text-theme-text-muted">
                        Sequences are private: only your API keys can call them.
                        Callers are billed the primary model's price whichever
                        model answers, so fallbacks must not cost more than the
                        primary.
                    </p>
                )}
            </Section>

            {editing && (
                <SequenceDialog
                    key={editing.id}
                    sequence={editing}
                    open
                    onOpenChange={(open) => !open && setEditing(null)}
                    onSubmit={handleUpdate}
                    modelOptions={modelOptions}
                />
            )}
            <Dialog
                open={!!deleting}
                onOpenChange={(open) => !open && setDeleting(null)}
                title="Delete Sequence"
                size="sm"
                contentClassName="p-6"
            >
                <p className="mb-6 mt-4">
                    Delete{" "}
                    <span className="font-mono text-sm">
                        {deleting?.modelId}
                    </span>
                    ? This removes the sequence and cannot be undone.
                </p>
                <div className="flex justify-end gap-2">
                    <Button type="button" onClick={() => setDeleting(null)}>
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        intent="danger"
                        onClick={() => void handleDelete()}
                    >
                        Delete
                    </Button>
                </div>
            </Dialog>
        </>
    );
}
