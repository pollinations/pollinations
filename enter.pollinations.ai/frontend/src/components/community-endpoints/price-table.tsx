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
import { COMMUNITY_ENDPOINT_PRICE_FIELDS } from "@shared/community-endpoints.ts";
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

export type PriceField = (typeof COMMUNITY_ENDPOINT_PRICE_FIELDS)[number];
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
    missing: boolean;
    nonPositive: boolean;
    invalid: boolean;
};

export function PriceGroups({
    form,
    testState,
    visiblePriceKeys,
    onChange,
}: {
    form: EndpointFormState;
    testState: ActionState;
    visiblePriceKeys: Set<PriceFieldKey>;
    onChange: (key: keyof EndpointFormState, value: string) => void;
}) {
    const rows = priceFormRows(visiblePriceKeys);

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
                                Input / 1M
                            </TableHeaderCell>
                            <TableHeaderCell
                                align="right"
                                className="normal-case tracking-normal"
                            >
                                Output / 1M
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
    const hasError =
        Boolean(
            inputState?.invalid ||
                inputState?.missing ||
                inputState?.nonPositive,
        ) ||
        Boolean(
            outputState?.invalid ||
                outputState?.missing ||
                outputState?.nonPositive,
        );
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
    const hasError = state.invalid || state.missing || state.nonPositive;

    return (
        <TableCell align="right" className="w-40 align-top">
            <div className="inline-flex flex-col items-end">
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
                    aria-label={`${field.label} price per 1M tokens`}
                    error={hasError}
                    className="h-9 w-32 max-w-full font-mono tabular-nums text-right"
                    onChange={(event) =>
                        onChange(field.key, event.target.value)
                    }
                />
                {hasError && (
                    <p className="mt-1 text-right text-xs text-intent-danger-text">
                        {state.invalid
                            ? "Use a dot decimal like 0.1"
                            : state.nonPositive
                              ? "Must be greater than 0"
                              : "Required for returned usage"}
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
    const value = form[field.key];
    const trimmedValue = value.trim();
    const invalid = !isValidPriceInput(value);
    return {
        observed,
        missing: observed && trimmedValue === "",
        nonPositive:
            observed &&
            trimmedValue !== "" &&
            !invalid &&
            Number(trimmedValue) <= 0,
        invalid,
    };
}

function priceFormRows(visiblePriceKeys: Set<PriceFieldKey>): PriceFormRow[] {
    const rows = new Map<string, PriceFormRow>();
    for (const field of COMMUNITY_ENDPOINT_PRICE_FIELDS) {
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
            ? COMMUNITY_ENDPOINT_PRICE_FIELDS.filter(
                  (field) => endpoint[field.key] > 0,
              ).map((field) => field.key)
            : [],
    );
}

// Base text tokens are always billed, so a public model must price them (public
// callers are never billed zero). Mirrors the backend REQUIRED_SHARED_PRICE_KEYS.
// Shown unconditionally once a model is being made public, before any test runs.
export const REQUIRED_SHARED_PRICE_KEYS: PriceFieldKey[] = [
    "promptTextPrice",
    "completionTextPrice",
];

export function returnedPriceFields(testState: ActionState): PriceField[] {
    if (testState.status !== "success") return [];
    return COMMUNITY_ENDPOINT_PRICE_FIELDS.filter((field) =>
        hasObservedPriceField(testState.usage, field),
    );
}

export function visiblePriceFieldKeys(
    savedPriceKeys: Set<PriceFieldKey>,
    returnedFields: PriceField[],
    // Always-shown floor (e.g. the base text fields required to publish), so a
    // fresh model going public still surfaces the fields the owner must price
    // before any endpoint test has run.
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
    for (const field of COMMUNITY_ENDPOINT_PRICE_FIELDS) {
        if (!visiblePriceKeys.has(field.key)) {
            next[field.key] = "";
        }
    }
    return next;
}

export function hasPositivePriceInput(
    form: EndpointFormState,
    field: PriceField,
): boolean {
    const value = form[field.key].trim();
    return value !== "" && isValidPriceInput(value) && Number(value) > 0;
}

export function hasValidVisibleFormPrices(
    form: EndpointFormState,
    visiblePriceKeys: Set<PriceFieldKey>,
): boolean {
    return COMMUNITY_ENDPOINT_PRICE_FIELDS.every(
        (field) =>
            !visiblePriceKeys.has(field.key) ||
            isValidPriceInput(form[field.key]),
    );
}
