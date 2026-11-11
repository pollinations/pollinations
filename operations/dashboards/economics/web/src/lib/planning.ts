import type {
    EconomicsPrivateConfig,
    PrivateForecastRule,
    VendorLedgerRow,
} from "../types";
import { forecastLineRule } from "./forecastTerms";
import { parsePrivateConfig } from "./pipeContracts";

const month = /^\d{4}-(0[1-9]|1[0-2])$/;

// The Drive document owns decisions and explanations; amounts come only from Vendor.
export function parsePlanningDocument(value: unknown): EconomicsPrivateConfig {
    const config = parsePrivateConfig({
        config: JSON.stringify(value),
        recorded_at: "",
    });
    if (!config.recordedAt || !Number.isFinite(Date.parse(config.recordedAt)))
        throw new Error("Planning document: missing revision date");
    for (const rule of Object.values(config.forecastRules)) {
        if (Object.keys(rule).some((key) => key !== "salesStoppedFrom"))
            throw new Error(
                "Planning document: financial plans belong in Vendor",
            );
    }
    for (const entries of [
        config.reviewNotes.providerCheckExplanations,
        config.reviewNotes.meterDriftExplanations,
        config.reviewNotes.pollenWitnessExplanations,
    ]) {
        const keys = new Set<string>();
        for (const item of entries) {
            const key = `${item?.month}|${item?.provider}`;
            if (
                !item ||
                !month.test(item.month) ||
                typeof item.provider !== "string" ||
                !item.provider.trim() ||
                typeof item.explanation !== "string" ||
                !item.explanation.trim() ||
                !Array.isArray(item.evidence) ||
                item.evidence.some((link) => typeof link !== "string") ||
                keys.has(key)
            )
                throw new Error(
                    "Planning document: invalid or duplicate review note",
                );
            keys.add(key);
        }
    }
    if (
        config.reviewNotes.providerCheckExplanations.some(
            (note) =>
                note.decision !== "known_limitation" ||
                note.reason !== "unverifiable_history",
        )
    )
        throw new Error(
            "Planning document: historical exceptions need an explicit known-limitation decision",
        );
    const ids = new Set<string>();
    for (const note of config.reviewNotes.planNotes ?? []) {
        if (
            !note ||
            typeof note.entryId !== "string" ||
            !note.entryId ||
            typeof note.explanation !== "string" ||
            !note.explanation ||
            ids.has(note.entryId)
        )
            throw new Error(
                "Planning document: invalid or duplicate plan note",
            );
        ids.add(note.entryId);
    }
    return config;
}

export function validateVendorPlan(row: VendorLedgerRow): void {
    if (row.type !== "planned") return;
    if (
        typeof row.plan_amount !== "number" ||
        !Number.isFinite(row.plan_amount) ||
        row.paid !== 0 ||
        row.credit !== 0 ||
        !["EUR", "USD"].includes(row.currency) ||
        !row.plan_category ||
        !forecastLineRule(row.vendor, row.plan_category) ||
        !["monthly", "once"].includes(row.plan_cadence ?? "") ||
        (row.start && !month.test(row.start)) ||
        (row.end && !month.test(row.end)) ||
        (row.start && row.end && row.start > row.end) ||
        (row.plan_cadence === "once" &&
            (!row.start || row.start !== row.end)) ||
        !Array.isArray(row.settled_by_entry_ids) ||
        row.settled_by_entry_ids.some((id) => typeof id !== "string" || !id) ||
        new Set(row.settled_by_entry_ids).size !==
            row.settled_by_entry_ids.length ||
        (row.plan_cadence === "monthly" && row.settled_by_entry_ids.length)
    )
        throw new Error(`Invalid Vendor plan: ${row.entry_id}`);
}

export function ledgerForecastRules(
    plans: readonly VendorLedgerRow[],
    config: EconomicsPrivateConfig,
): Record<string, PrivateForecastRule> {
    // The dashboard plans no future refunds; actual refunds remain in Sales.
    const rules: Record<string, PrivateForecastRule> = {
        "stripe refunds|revenue": {
            fixedAmounts: [{ amount: 0, currency: "USD" }],
        },
        ...structuredClone(config.forecastRules),
    };
    const notes = new Map(
        config.reviewNotes.planNotes?.map((note) => [
            note.entryId,
            note.explanation,
        ]),
    );
    const ids = new Set<string>();
    const fixedKeys = new Set<string>();
    for (const row of [...plans].sort(
        (a, b) =>
            a.start.localeCompare(b.start) ||
            a.currency.localeCompare(b.currency),
    )) {
        validateVendorPlan(row);
        if (ids.has(row.entry_id))
            throw new Error(`Duplicate Vendor plan: ${row.entry_id}`);
        ids.add(row.entry_id);
        const key = `${row.vendor}|${row.plan_category}`;
        rules[key] ??= {};
        const rule = rules[key];
        const amount = {
            amount: row.plan_amount as number,
            currency: row.currency as "EUR" | "USD",
        };
        if (row.plan_cadence === "once") {
            rule.scheduledAmounts ??= [];
            rule.scheduledAmounts.push({
                ...amount,
                month: row.start,
                note: notes.get(row.entry_id) ?? row.resource_name,
                ...(row.settled_by_entry_ids?.length
                    ? { settledByEntryIds: row.settled_by_entry_ids }
                    : {}),
            });
        } else {
            const fixedKey = `${key}|${row.currency}`;
            if (
                fixedKeys.has(fixedKey) ||
                (rule.fixedAmounts &&
                    ((rule.activeFrom ?? "") !== row.start ||
                        (rule.activeThrough ?? "") !== row.end))
            )
                throw new Error(`Conflicting monthly Vendor plans: ${key}`);
            fixedKeys.add(fixedKey);
            if (row.start) rule.activeFrom = row.start;
            if (row.end) rule.activeThrough = row.end;
            rule.fixedAmounts ??= [];
            rule.fixedAmounts.push(amount);
        }
    }
    return rules;
}
