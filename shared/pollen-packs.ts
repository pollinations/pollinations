import { PUBLIC_URLS } from "./public-urls.ts";

export type PollenPackKey = "p2" | "p5" | "p10" | "p20" | "p50" | "p100";

export type PollenPack = {
    packKey: PollenPackKey;
    amountUsd: number;
    discountPercent: number;
    priceUsd: number;
    priceCents: number;
    pollenGrant: number;
    checkoutName: string;
    checkoutDescription: string;
    checkoutImageUrl: string;
    taxCode: string;
};

const CHECKOUT_IMAGE_URL = `${PUBLIC_URLS.enter.production}/checkout/pollen-pack.png`;
const POLLEN_TAX_CODE = "txcd_10103001";
const CHECKOUT_FEEDBACK_URL = "https://discord.gg/z5uMbEYK";

// `amountUsd` is the nominal pack size: 1 pollen ≈ $1 before discounts.
const BASE_POLLEN_PACKS: ReadonlyArray<{
    packKey: PollenPackKey;
    amountUsd: number;
    discountPercent: number;
}> = [
    { packKey: "p2", amountUsd: 2, discountPercent: 0 },
    { packKey: "p5", amountUsd: 5, discountPercent: 15 },
    { packKey: "p10", amountUsd: 10, discountPercent: 20 },
    { packKey: "p20", amountUsd: 20, discountPercent: 25 },
    { packKey: "p50", amountUsd: 50, discountPercent: 30 },
    { packKey: "p100", amountUsd: 100, discountPercent: 35 },
];

const PACK_KEY_SET = new Set<PollenPackKey>(
    BASE_POLLEN_PACKS.map(({ packKey }) => packKey),
);

export const formatPollenPackValue = (value: number): string =>
    Number.isInteger(value)
        ? value.toLocaleString("en-US")
        : value.toLocaleString("en-US", {
              minimumFractionDigits: 1,
              maximumFractionDigits: 1,
          });

export const formatPollenPackPriceUsd = (value: number): string =>
    value.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
        maximumFractionDigits: 2,
    });

export const POLLEN_PACKS: ReadonlyArray<PollenPack> = BASE_POLLEN_PACKS.map(
    ({ packKey, amountUsd, discountPercent }) => {
        const pollenGrant = amountUsd;
        const priceCents = Math.round(
            amountUsd * 100 * (1 - discountPercent / 100),
        );
        const priceUsd = priceCents / 100;
        const discountSuffix =
            discountPercent > 0 ? ` (${discountPercent}% off)` : "";
        const checkoutName = `🪷 ${formatPollenPackValue(pollenGrant)} Pollen`;
        const checkoutDescription = `Tiny bits of creative energy for pollinations.ai 🌱 ${formatPollenPackValue(pollenGrant)} Pollen for ${formatPollenPackPriceUsd(priceUsd)}${discountSuffix}. Feedback: ${CHECKOUT_FEEDBACK_URL}`;

        return {
            packKey,
            amountUsd,
            discountPercent,
            priceUsd,
            priceCents,
            pollenGrant,
            checkoutName,
            checkoutDescription,
            checkoutImageUrl: CHECKOUT_IMAGE_URL,
            taxCode: POLLEN_TAX_CODE,
        };
    },
);

export const isPollenPackKey = (value: string): value is PollenPackKey =>
    PACK_KEY_SET.has(value as PollenPackKey);

export const getPollenPackByKey = (packKey: string): PollenPack | undefined =>
    POLLEN_PACKS.find((pack) => pack.packKey === packKey);

// Amount-based lookup is kept only for auto-top-up, whose enrollment API stores
// the nominal pack amount as packAmountUsd. The checkout route is packKey-only.
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

export const describePollenPack = (pack: PollenPack): string => {
    const discountSuffix =
        pack.discountPercent > 0 ? ` (${pack.discountPercent}% off)` : "";
    return `${formatPollenPackValue(pack.pollenGrant)} pollen for ${formatPollenPackPriceUsd(pack.priceUsd)}${discountSuffix}`;
};

export const getPackDiscountPercent = (pack: PollenPack): number =>
    pack.discountPercent;
