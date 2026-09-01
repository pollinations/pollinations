import {
    COMMUNITY_ENDPOINT_PRICE_FIELDS,
    COMMUNITY_MODALITY_SPEC,
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
    MAX_COMMUNITY_PRICE_PER_VIDEO_SECOND,
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
    video_second: {
        maximum: MAX_COMMUNITY_PRICE_PER_VIDEO_SECOND,
        label: `${MAX_COMMUNITY_PRICE_PER_VIDEO_SECOND} Pollen per second`,
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
    const permitted = COMMUNITY_MODALITY_SPEC[modality].inputModalities;
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

function normalizeAdvertised(
    advertised: CommunityEndpointAdvertised | undefined,
): CommunityEndpointAdvertised | undefined {
    return hasAdvertisedClaim(advertised) ? advertised : undefined;
}

function assertAdvertised(
    modality: CommunityEndpointModality,
    advertised: CommunityEndpointAdvertised | undefined,
): void {
    if (modality !== "text" && hasAdvertisedClaim(advertised)) {
        throw new HTTPException(400, {
            message: "advertised metadata is only supported for text models",
        });
    }
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

function validatePolicy(
    policy: ProxyPolicy,
    requestedAdvertised: CommunityEndpointAdvertised | undefined,
): ProxyPolicy {
    assertInputModalities(policy.modality, policy.inputModalities);
    // An omitted update preserves stored metadata without revalidating it.
    assertAdvertised(policy.modality, requestedAdvertised);
    assertPriceLimits(policy.prices, policy.modality, policy.imagePricing);
    return policy;
}

export function deriveCreateProxyPolicy(input: ProxyCreateInput): ProxyPolicy {
    const modality = input.modality;
    const imagePricing = modality === "image" ? input.imagePricing : "request";
    const inputModalities =
        input.inputModalities ??
        normalizeCommunityEndpointInputModalities(undefined, modality);

    return validatePolicy(
        {
            modality,
            imagePricing,
            inputModalities,
            advertised: normalizeAdvertised(input.advertised),
            perUserRpm: input.perUserRpm ?? null,
            ...visibilityPolicy(
                input.visibility,
                input.paidOnly,
                input,
                modality,
                imagePricing,
            ),
        },
        input.advertised,
    );
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

    return validatePolicy(
        {
            modality,
            imagePricing,
            inputModalities,
            advertised:
                input.advertised === undefined
                    ? stored.advertised
                    : normalizeAdvertised(input.advertised),
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
        },
        input.advertised,
    );
}

export function proxyPricingChanged(
    current: Pick<ProxyListingPayload, "paidOnly" | "imagePricing" | "prices">,
    target: Pick<ProxyListingPayload, "paidOnly" | "imagePricing" | "prices">,
): boolean {
    return (
        current.paidOnly !== target.paidOnly ||
        current.imagePricing !== target.imagePricing ||
        COMMUNITY_ENDPOINT_PRICE_FIELDS.some(
            ({ key }) => current.prices[key] !== target.prices[key],
        )
    );
}

export function hasProxyPricingInput(input: ProxyUpdateInput): boolean {
    return (
        input.paidOnly !== undefined ||
        input.imagePricing !== undefined ||
        COMMUNITY_ENDPOINT_PRICE_FIELDS.some(
            ({ key }) => input[key] !== undefined,
        )
    );
}

export function withoutProxyPricingChanges(
    input: ProxyUpdateInput,
): ProxyUpdateInput {
    const immediate = { ...input };
    delete immediate.paidOnly;
    delete immediate.imagePricing;
    for (const { key } of COMMUNITY_ENDPOINT_PRICE_FIELDS) {
        delete immediate[key];
    }
    return immediate;
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
