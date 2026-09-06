const PREPAID_VENDORS = new Set([
    "vast.ai",
    "deepinfra",
    "pruna",
    "fal",
    "mistral",
    "runpod",
]);

export function isPrepaidVendor(vendor: string): boolean {
    return PREPAID_VENDORS.has(vendor);
}
