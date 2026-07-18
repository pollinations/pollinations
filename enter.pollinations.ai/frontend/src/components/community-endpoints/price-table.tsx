import {
    Chip,
    Input,
    Surface,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
    TableRow,
} from "@pollinations/ui";
import {
    COMMUNITY_ENDPOINT_PRICE_FIELDS,
    type CommunityEndpointModality,
    communityEndpointPriceFieldsForModality,
    MIN_COMMUNITY_PRICE_PER_MILLION_TOKENS,
    MIN_COMMUNITY_PRICE_PER_UNIT,
} from "@shared/community-endpoints.ts";
import { PRICE_ICON } from "../models/model-icons.tsx";
import type { PriceKind } from "../models/types.ts";
import {
    type ActionState,
    type CommunityEndpoint,
    type EndpointFormState,
    hasObservedPriceField,
    isValidPriceInput,
    observedUsageValue,
} from "./types.ts";

export type PriceField = ReturnType<
    typeof communityEndpointPriceFieldsForModality
>[number];
export type PriceFieldKey = PriceField["key"];
type PriceColumn = "input" | "output";
type PriceFormRow = {
    key: string;
    label: string;
    iconKinds: PriceKind[];
    inputField?: PriceField;
    outputField?: PriceField;
};

type PriceCellState = {
    observed: boolean;
    invalid: boolean;
};

export function PriceGroups({
    form,
    modality,
    testState,
    visiblePriceKeys,
    onChange,
}: {
    form: EndpointFormState;
    modality: CommunityEndpointModality;
    testState: ActionState;
    visiblePriceKeys: Set<PriceFieldKey>;
    onChange: (key: keyof EndpointFormState, value: string) => void;
}) {
    const rows = priceFormRows(visiblePriceKeys, modality);

    if (rows.length === 0) return null;

    return (
        <Surface className="overflow-hidden p-0">
            <div className="overflow-x-auto">
                <Table className="min-w-[32rem]">
                    <TableHead>
                        <TableRow>
                            <TableHeaderCell className="normal-case tracking-normal">
                                Usage type
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                className="normal-case tracking-normal"
                            >
                                Input price
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                className="normal-case tracking-normal"
                            >
                                Output price
                            </TableHeaderCell>
                        </TableRow>
                    </TableHead>
                    <TableBody className="divide-y-0">
                        {rows.map((row) => (
                            <PriceRow
                                key={row.key}
                                row={row}
                                form={form}
                                testState={testState}
                                onChange={onChange}
                            />
                        ))}
                    </TableBody>
                </Table>
            </div>
        </Surface>
    );
}

function PriceRow({
    row,
    form,
    testState,
    onChange,
}: {
    row: PriceFormRow;
    form: EndpointFormState;
    testState: ActionState;
    onChange: (key: keyof EndpointFormState, value: string) => void;
}) {
    const inputState = row.inputField
        ? priceCellState(row.inputField, form, testState)
        : null;
    const outputState = row.outputField
        ? priceCellState(row.outputField, form, testState)
        : null;
    const hasError = Boolean(inputState?.invalid || outputState?.invalid);
    const returned = Boolean(inputState?.observed || outputState?.observed);

    return (
        <TableRow intent={hasError ? "danger" : "default"}>
            <TableCell>
                <div className="flex min-w-0 items-center gap-2">
                    <span className="inline-flex shrink-0 items-center gap-0.5 text-theme-text-muted">
                        {row.iconKinds.map((kind) => {
                            const Icon = PRICE_ICON[kind];
                            return <Icon key={kind} className="h-3.5 w-3.5" />;
                        })}
                    </span>
                    <span className="min-w-0 truncate text-sm font-medium text-theme-text-strong">
                        {row.label}
                    </span>
                    {returned && (
                        <Chip intent="neutral" size="sm">
                            returned
                        </Chip>
                    )}
                </div>
            </TableCell>
            <PriceInputCell
                field={row.inputField}
                state={inputState}
                value={row.inputField ? form[row.inputField.key] : ""}
                onChange={onChange}
            />
            <PriceInputCell
                field={row.outputField}
                state={outputState}
                value={row.outputField ? form[row.outputField.key] : ""}
                onChange={onChange}
            />
        </TableRow>
    );
}

function PriceInputCell({
    field,
    state,
    value,
    onChange,
}: {
    field: PriceField | undefined;
    state: PriceCellState | null;
    value: string;
    onChange: (key: keyof EndpointFormState, value: string) => void;
}) {
    if (!field || !state) {
        return (
            <TableCell align="right" muted>
                -
            </TableCell>
        );
    }

    const inputId = `community-${field.key}`;
    const hasError = state.invalid;
    const unitLabel = field.priceUnit === "image" ? "/image" : "/1M";
    const minimum =
        field.priceUnit === "million"
            ? MIN_COMMUNITY_PRICE_PER_MILLION_TOKENS
            : MIN_COMMUNITY_PRICE_PER_UNIT;

    return (
        <TableCell align="right" className="w-40 align-top">
            <div className="inline-flex flex-col items-end">
                <div className="flex items-center gap-1.5">
                    <Input
                        id={inputId}
                        name={inputId}
                        type="number"
                        step="any"
                        min="0"
                        inputMode="decimal"
                        hideNumberSteppers
                        value={value}
                        placeholder="0"
                        autoComplete="off"
                        aria-label={`${field.label} price ${unitLabel}`}
                        error={hasError}
                        className="h-9 w-28 max-w-full font-mono tabular-nums text-right"
                        onChange={(event) =>
                            onChange(field.key, event.target.value)
                        }
                    />
                    <span className="w-10 text-left text-xs text-theme-text-muted">
                        {unitLabel}
                    </span>
                </div>
                {hasError && (
                    <p className="mt-1 text-right text-xs text-intent-danger-text">
                        0 (free) or at least {minimum} {unitLabel}
                    </p>
                )}
            </div>
        </TableCell>
    );
}

function priceCellState(
    field: PriceField,
    form: EndpointFormState,
    testState: ActionState,
): PriceCellState {
    const observed =
        observedUsageValue(testState.usage, testState.billableUsage, field) !==
        null;
    return {
        observed,
        invalid: !isValidPriceInput(form[field.key], field.priceUnit),
    };
}

function priceFormRows(
    visiblePriceKeys: Set<PriceFieldKey>,
    modality: CommunityEndpointModality,
): PriceFormRow[] {
    const rows = new Map<string, PriceFormRow>();
    for (const field of communityEndpointPriceFieldsForModality(modality)) {
        if (!visiblePriceKeys.has(field.key)) continue;
        const column = priceColumn(field);
        if (!column) continue;
        const label = priceRowLabel(field);
        const key = label.toLowerCase();
        const iconKind = priceKind(field);
        const row = rows.get(key) ?? { key, label, iconKinds: [] };
        row.iconKinds = [...new Set([...row.iconKinds, iconKind])];
        if (column === "input") {
            row.inputField = field;
        } else {
            row.outputField = field;
        }
        rows.set(key, row);
    }
    return [...rows.values()];
}

function priceColumn(field: PriceField): PriceColumn | null {
    if (field.usageType.startsWith("prompt")) return "input";
    if (field.usageType.startsWith("completion")) return "output";
    return null;
}

function priceRowLabel(field: PriceField): string {
    const label = shortPriceLabel(field.label);
    return label.charAt(0).toUpperCase() + label.slice(1);
}

function priceKind(field: PriceField): PriceKind {
    if (field.usageType.includes("Cached")) return "cached";
    if (field.usageType.includes("CacheWrite")) return "cacheWrite";
    if (field.usageType.includes("Reasoning")) return "reasoning";
    if (field.usageType.includes("Audio")) {
        return field.usageType.startsWith("prompt") ? "audioIn" : "audioOut";
    }
    if (field.usageType.includes("Image")) return "image";
    return "text";
}

function shortPriceLabel(label: string): string {
    return label.replace(/^Prompt /, "").replace(/^Completion /, "");
}

export function savedEndpointPriceKeys(
    endpoint: CommunityEndpoint | undefined,
): Set<PriceFieldKey> {
    return new Set(
        endpoint
            ? communityEndpointPriceFieldsForModality(endpoint.modality)
                  .filter((field) => endpoint[field.key] > 0)
                  .map((field) => field.key)
            : [],
    );
}

// Show the base text prices as soon as a model is made public. They remain
// optional: blank or zero publishes the model for free.
export const BASE_TEXT_PRICE_KEYS: PriceFieldKey[] = [
    "promptTextPrice",
    "completionTextPrice",
];

export function returnedPriceFields(
    testState: ActionState,
    modality: CommunityEndpointModality,
): PriceField[] {
    if (testState.status !== "success") return [];
    return communityEndpointPriceFieldsForModality(modality).filter((field) =>
        hasObservedPriceField(testState.usage, field),
    );
}

export function visiblePriceFieldKeys(
    savedPriceKeys: Set<PriceFieldKey>,
    returnedFields: PriceField[],
    // Fields that should be visible before any endpoint test has run.
    alwaysVisible: PriceFieldKey[] = [],
): Set<PriceFieldKey> {
    return new Set([
        ...alwaysVisible,
        ...savedPriceKeys,
        ...returnedFields.map((field) => field.key),
    ]);
}

export function formWithVisiblePrices(
    form: EndpointFormState,
    visiblePriceKeys: Set<PriceFieldKey>,
): EndpointFormState {
    const next = { ...form };
    const allowed = new Set(
        communityEndpointPriceFieldsForModality(form.modality).map(
            (field) => field.key,
        ),
    );
    for (const field of COMMUNITY_ENDPOINT_PRICE_FIELDS) {
        if (!visiblePriceKeys.has(field.key) || !allowed.has(field.key)) {
            next[field.key] = "";
        }
    }
    return next;
}

export function hasValidVisibleFormPrices(
    form: EndpointFormState,
    visiblePriceKeys: Set<PriceFieldKey>,
): boolean {
    const fields = new Map(
        communityEndpointPriceFieldsForModality(form.modality).map((field) => [
            field.key,
            field,
        ]),
    );
    return COMMUNITY_ENDPOINT_PRICE_FIELDS.every((field) => {
        if (!visiblePriceKeys.has(field.key)) return true;
        const modalityField = fields.get(field.key);
        return Boolean(
            modalityField &&
                isValidPriceInput(form[field.key], modalityField.priceUnit),
        );
    });
}
