import entrySchema from "../../../ingest/entry.schema.json";

function strings(values: readonly unknown[]): string[] {
    return values.filter((value): value is string => typeof value === "string");
}

export const TRANSACTION_CATEGORIES = strings(
    entrySchema.properties.op_transaction_category.enum,
);

export const CLOUD_TYPES = strings(entrySchema.properties.op_cloud_type.enum);

const transactionCategories = new Set<string>(TRANSACTION_CATEGORIES);
const cloudTypes = new Set<string>(CLOUD_TYPES);

export function isTransactionCategory(value: string): boolean {
    return transactionCategories.has(value);
}

export function isCloudType(value: string): boolean {
    return cloudTypes.has(value);
}
