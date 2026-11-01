import { UpstreamError } from "@shared/error.ts";
import { fetchUpstream } from "./fetchUpstream.ts";

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

/** fal's current USD price per billable unit of one endpoint. */
export async function falUnitPrice(
    endpointId: string,
    apiKey: string,
): Promise<number> {
    const response = await fetchUpstream(
        `https://api.fal.ai/v1/models/pricing?endpoint_id=${encodeURIComponent(endpointId)}`,
        {
            headers: { Authorization: `Key ${apiKey}` },
            errorLabel: "Fal pricing lookup failed",
        },
    );
    const { prices } = (await response.json()) as {
        prices?: {
            endpoint_id: string;
            unit_price: number;
            currency: string;
        }[];
    };
    const price = prices?.find((price) => price.endpoint_id === endpointId);
    if (
        price?.currency !== "USD" ||
        !Number.isFinite(price.unit_price) ||
        price.unit_price <= 0
    ) {
        throw UpstreamError.fromProvider(502, {
            message: "Fal returned invalid pricing",
        });
    }
    return price.unit_price;
}
