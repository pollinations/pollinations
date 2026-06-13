export type PollenPackKey = "p2" | "p5" | "p10" | "p20" | "p50" | "p100";

export type PollenPack = {
    packKey: PollenPackKey;
    amountUsd: number;
    checkoutName: string;
    checkoutDescription: string;
    // Path on the enter worker; the route resolves the absolute URL from the
    // request origin so staging and prod each serve their own asset.
    checkoutImagePath: string;
    taxCode: string;
};

// 1200x440 transparent PNG with the logo small + centered. Stripe Checkout
// scales the source to band width, so a landscape canvas yields a short
// header on mobile and the transparency lets the band color show through.
const CHECKOUT_IMAGE_PATH = "/checkout/pollen-pack-wide.png";
const POLLEN_TAX_CODE = "txcd_10103001";
const CHECKOUT_FEEDBACK_URL = "https://discord.gg/z5uMbEYK";

// USD is the canonical reference: 1 pollen ≈ $1. You get what you buy.
const BASE_POLLEN_PACKS: ReadonlyArray<{
    packKey: PollenPackKey;
    amountUsd: number;
}> = [
    { packKey: "p2", amountUsd: 2 },
    { packKey: "p5", amountUsd: 5 },
    { packKey: "p10", amountUsd: 10 },
    { packKey: "p20", amountUsd: 20 },
    { packKey: "p50", amountUsd: 50 },
    { packKey: "p100", amountUsd: 100 },
];

const PACK_KEY_SET = new Set<PollenPackKey>(
    BASE_POLLEN_PACKS.map(({ packKey }) => packKey),
);

export const formatPollenPackValue = (value: number): string =>
    value.toLocaleString("en-US");

export const POLLEN_PACKS: ReadonlyArray<PollenPack> = BASE_POLLEN_PACKS.map(
    ({ packKey, amountUsd }) => ({
        packKey,
        amountUsd,
        checkoutName: `${formatPollenPackValue(amountUsd)} Pollen`,
        checkoutDescription: `Creative credits for pollinations.ai. 1 Pollen ≈ $1. Questions or feedback: ${CHECKOUT_FEEDBACK_URL}`,
        checkoutImagePath: CHECKOUT_IMAGE_PATH,
        taxCode: POLLEN_TAX_CODE,
    }),
);

export const isPollenPackKey = (value: string): value is PollenPackKey =>
    PACK_KEY_SET.has(value as PollenPackKey);

export const getPollenPackByKey = (packKey: string): PollenPack | undefined =>
    POLLEN_PACKS.find((pack) => pack.packKey === packKey);

// Amount-based lookup is kept only for auto-top-up, whose enrollment API is
// genuinely amount-based (amountUsd as the user-facing knob). The checkout
// route is packKey-only.
//
// Accepts nullable input because auto-top-up rows often carry `number | null`
// from D1 / `number | undefined` from inbound request bodies; returning
// undefined for nullish keeps callers from needing defensive narrowing.
export const getPollenPackByAmount = (
    amountUsd: number | null | undefined,
): PollenPack | undefined =>
    typeof amountUsd === "number"
        ? POLLEN_PACKS.find((pack) => pack.amountUsd === amountUsd)
        : undefined;

export const describePollenPack = (pack: PollenPack): string =>
    `$${pack.amountUsd} -> ${formatPollenPackValue(pack.amountUsd)} pollen`;
