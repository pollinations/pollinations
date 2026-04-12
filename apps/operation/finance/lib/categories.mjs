export const CATEGORIES = [
    "Revenue",
    "Compute",
    "Employee Salaries",
    "Freelancer",
    "Office",
    "Productivity",
    "Infra",
    "Banking",
    "Other",
];

export const REVENUE_CATEGORIES = new Set(["Revenue", "API Sell"]);

export function isRevenue(category) {
    return REVENUE_CATEGORIES.has(category);
}

const INDEX = new Map(CATEGORIES.map((c, i) => [c, i]));

export function categoryIndex(category) {
    const i = INDEX.get(category);
    return i === undefined ? CATEGORIES.length : i;
}
