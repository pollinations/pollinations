import { R2_LIFECYCLE_TTL_MS } from "../r2-storage.ts";
import { roundPollenLedgerAmount } from "./precision.ts";

// R2's storage price, in pollen (1 pollen ≈ $1) per GB-month.
const R2_GB_MONTH = 0.015;
// Smaller files are billed as this size, like S3's infrequent-access classes,
// so tiny files are not stored for free.
const MIN_BILLED_BYTES = 128 * 1024;

/**
 * What storing `size` bytes for `ms` milliseconds costs at R2's price, and
 * what the key that uploaded it pays: half of that, for now.
 */
export function mediaStorageLease(
    size: number,
    ms: number,
): { cost: number; price: number } {
    const cost =
        (Math.max(size, MIN_BILLED_BYTES) / 1e9) *
        R2_GB_MONTH *
        (ms / R2_LIFECYCLE_TTL_MS);
    return {
        cost: roundPollenLedgerAmount(cost),
        price: roundPollenLedgerAmount(cost / 2),
    };
}
