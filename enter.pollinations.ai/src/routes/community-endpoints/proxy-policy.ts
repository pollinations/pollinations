import {
    COMMUNITY_ENDPOINT_INPUT_MODALITIES,
    COMMUNITY_ENDPOINT_PRICE_FIELDS,
    type CommunityEndpointAdvertised,
    type CommunityEndpointImagePricing,
    type CommunityEndpointModality,
    type CommunityEndpointPriceKey,
    type CommunityEndpointPrices,
    type CommunityEndpointVisibility,
    communityEndpointPriceFieldsForModality,
    communityEndpointPrices,
    communityEndpointPricesForModality,
    MAX_COMMUNITY_PRICE_PER_IMAGE,
    MAX_COMMUNITY_PRICE_PER_MILLION_TOKENS,
    MAX_COMMUNITY_PRICE_PER_SECOND,
    MAX_COMMUNITY_PRICE_PER_TOKEN,
    normalizeCommunityEndpointInputModalities,
    type ProxyListingPayload,
} from "@shared/community-endpoints.ts";
import { HTTPException } from "hono/http-exception";
import type { ProxyCreateInput, ProxyUpdateInput } from "./schemas.ts";

export type ProxyPolicy = Pick<
    ProxyListingPayload,
    | "modality"
    | "imagePricing"
    | "inputModalities"
    | "paidOnly"
    | "perUserRpm"
    | "advertised"
    | "prices"
>;

const PRICE_LIMIT_BY_UNIT = {
    image: {
        maximum: MAX_COMMUNITY_PRICE_PER_IMAGE,
        label: `${MAX_COMMUNITY_PRICE_PER_IMAGE} Pollen per image`,
    },
    second: {
        maximum: MAX_COMMUNITY_PRICE_PER_SECOND,
        label: `${MAX_COMMUNITY_PRICE_PER_SECOND} Pollen per second`,
    },
    token: {
        maximum: MAX_COMMUNITY_PRICE_PER_TOKEN,
        label: `${MAX_COMMUNITY_PRICE_PER_MILLION_TOKENS} Pollen per 1M tokens`,
    },
    million: {
        maximum: MAX_COMMUNITY_PRICE_PER_TOKEN,
        label: `${MAX_COMMUNITY_PRICE_PER_MILLION_TOKENS} Pollen per 1M tokens`,
    },
} as const;

function assertPriceLimits(
    prices: CommunityEndpointPrices,
    modality: CommunityEndpointModality,
    imagePricing: CommunityEndpointImagePricing,
): void {
    for (const field of communityEndpointPriceFieldsForModality(
        modality,
        imagePricing,
    )) {
        const limit = PRICE_LIMIT_BY_UNIT[field.priceUnit];
        if (prices[field.key] <= limit.maximum) continue;
        throw new HTTPException(400, {
            message: `${field.label} price must not exceed ${limit.label}`,
        });
    }
}

function assertInputModalities(
    modality: CommunityEndpointModality,
    inputModalities: readonly string[],
): void {
    const permitted = COMMUNITY_ENDPOINT_INPUT_MODALITIES[modality];
    const unsupported = inputModalities.find(
        (input) => !(permitted as readonly string[]).includes(input),
    );
    if (!unsupported) return;
    throw new HTTPException(400, {
        message: `${unsupported} input is not supported for ${modality} models`,
    });
}

function hasAdvertisedClaim(
    advertised: CommunityEndpointAdvertised | undefined,
): boolean {
    return Object.values(advertised ?? {}).some((value) =>
        Array.isArray(value) ? value.length > 0 : value != null,
    );
}

function advertisedPolicy(
    modality: CommunityEndpointModality,
    advertised: CommunityEndpointAdvertised | undefined,
): CommunityEndpointAdvertised | undefined {
    if (modality !== "text" && hasAdvertisedClaim(advertised)) {
        throw new HTTPException(400, {
            message: "advertised metadata is only supported for text models",
        });
    }
    return hasAdvertisedClaim(advertised) ? advertised : undefined;
}

function visibilityPolicy(
    visibility: CommunityEndpointVisibility,
    requestedPaidOnly: boolean,
    priceSource: Partial<Record<CommunityEndpointPriceKey, number>>,
    modality: CommunityEndpointModality,
    imagePricing: CommunityEndpointImagePricing,
): Pick<ProxyPolicy, "paidOnly" | "prices"> {
    return visibility === "private"
        ? { paidOnly: false, prices: communityEndpointPrices({}) }
        : {
              paidOnly: requestedPaidOnly,
              prices: communityEndpointPricesForModality(
                  priceSource,
                  modality,
                  imagePricing,
              ),
          };
}

function validatePolicy(policy: ProxyPolicy): ProxyPolicy {
    assertInputModalities(policy.modality, policy.inputModalities);
    assertPriceLimits(policy.prices, policy.modality, policy.imagePricing);
    return policy;
}

export function deriveCreateProxyPolicy(input: ProxyCreateInput): ProxyPolicy {
    const modality = input.modality;
    const imagePricing = modality === "image" ? input.imagePricing : "request";
    const inputModalities =
        input.inputModalities ??
        normalizeCommunityEndpointInputModalities(undefined, modality);

    return validatePolicy({
        modality,
        imagePricing,
        inputModalities,
        advertised: advertisedPolicy(modality, input.advertised),
        perUserRpm: input.perUserRpm ?? null,
        ...visibilityPolicy(
            input.visibility,
            input.paidOnly,
            input,
            modality,
            imagePricing,
        ),
    });
}

function updatePriceSource(
    stored: ProxyListingPayload,
    input: ProxyUpdateInput,
    imagePricing: CommunityEndpointImagePricing,
): Partial<Record<CommunityEndpointPriceKey, number>> {
    const resetPrices =
        imagePricing === stored.imagePricing
            ? {}
            : Object.fromEntries(
                  communityEndpointPriceFieldsForModality(
                      stored.modality,
                      imagePricing,
                  )
                      .filter((field) => input[field.key] === undefined)
                      .map((field) => [field.key, 0]),
              );
    return { ...stored.prices, ...input, ...resetPrices };
}

export function deriveUpdatedProxyPolicy(
    stored: ProxyListingPayload,
    input: ProxyUpdateInput,
    visibility: CommunityEndpointVisibility,
): ProxyPolicy {
    const modality = stored.modality;
    const imagePricing =
        modality === "image"
            ? (input.imagePricing ?? stored.imagePricing)
            : stored.imagePricing;
    const inputModalities = input.inputModalities ?? stored.inputModalities;

    return validatePolicy({
        modality,
        imagePricing,
        inputModalities,
        advertised:
            input.advertised === undefined
                ? stored.advertised
                : advertisedPolicy(modality, input.advertised),
        perUserRpm:
            input.perUserRpm === undefined
                ? stored.perUserRpm
                : input.perUserRpm,
        ...visibilityPolicy(
            visibility,
            input.paidOnly ?? stored.paidOnly,
            updatePriceSource(stored, input, imagePricing),
            modality,
            imagePricing,
        ),
    });
}

export function changesProxyPayload(input: ProxyUpdateInput): boolean {
    return [
        input.bearerToken,
        input.visibility,
        input.perUserRpm,
        input.paidOnly,
        input.imagePricing,
        input.inputModalities,
        input.advertised,
        input.fallbacks,
        ...COMMUNITY_ENDPOINT_PRICE_FIELDS.map(({ key }) => input[key]),
    ].some((value) => value !== undefined);
}
