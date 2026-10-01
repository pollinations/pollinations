import { UpstreamError } from "@shared/error.ts";

/**
 * The quantity fal billed for a request, in the endpoint's pricing unit.
 * Sync responses and queue result fetches both carry it.
 */
export function falBillableUnits(response: Response): number {
    const units = Number(response.headers.get("x-fal-billable-units"));
    if (!Number.isFinite(units) || units <= 0) {
        throw UpstreamError.fromProvider(502, {
            message: "Fal response has no billable units",
        });
    }
    return units;
}
