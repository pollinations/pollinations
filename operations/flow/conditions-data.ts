export const conditionOptions = {
    account: ["signed-in", "signed-out", "banned"],
    pollen: ["paid", "quest", "empty"],
    allowance: ["available", "exhausted"],
    role: ["member", "admin"],
} as const;

export type Conditions = {
    [K in keyof typeof conditionOptions]: (typeof conditionOptions)[K][number];
};

export const defaultConditions: Conditions = {
    account: "signed-in",
    pollen: "paid",
    allowance: "available",
    role: "member",
};

export function parseConditions(value: unknown): Partial<Conditions> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("Conditions must be an object");
    }
    const result: Partial<Conditions> = {};
    for (const [key, selection] of Object.entries(value)) {
        const options = conditionOptions[key as keyof Conditions];
        if (!options || !(options as readonly unknown[]).includes(selection)) {
            throw new Error(`Invalid condition: ${key}`);
        }
        Object.assign(result, { [key]: selection });
    }
    return result;
}

// Previews and Journey use the same baseline; another review cannot leak into it.
export function reviewConditions(recipe: {
    conditions: Partial<Conditions>;
}): Conditions {
    return { ...defaultConditions, ...recipe.conditions };
}
