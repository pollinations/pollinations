import { PUBLIC_URLS } from "./public-urls.ts";

export type PollenPackKey = "p2" | "p5" | "p10" | "p20" | "p50" | "p100";

export type PollenPack = {
    packKey: PollenPackKey;
    amountUsd: number;
    checkoutName: string;
    checkoutDescription: string;
    checkoutImageUrl: string;
    taxCode: string;
};

const CHECKOUT_IMAGE_URL = `${PUBLIC_URLS.enter.production}/checkout/pollen-pack.png`;
const POLLEN_TAX_CODE = "txcd_10103001";
const CHECKOUT_FEEDBACK_URL = "https://discord.gg/z5uMbEYK";
export const SERVICE_FEE_RATE_BPS = 350;
export const SERVICE_FEE_FIXED_CENTS = 30;
export const SERVICE_FEE_NAME = "Service fee";
export const SERVICE_FEE_LINE_TYPE = "service_fee";
export const POLLEN_PACK_LINE_TYPE = "pollen_pack";
export const SERVICE_FEE_TAX_CODE = POLLEN_TAX_CODE;

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
        checkoutName: `🪷 ${formatPollenPackValue(amountUsd)} Pollen`,
        checkoutDescription: `Tiny bits of creative energy for pollinations.ai 🌱 Feedback: ${CHECKOUT_FEEDBACK_URL}`,
        checkoutImageUrl: CHECKOUT_IMAGE_URL,
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

export const calculateServiceFeeCents = (packAmountCents: number): number => {
    if (!Number.isFinite(packAmountCents) || packAmountCents <= 0) {
        return 0;
    }

    return Math.ceil(
        (packAmountCents * SERVICE_FEE_RATE_BPS) / 10_000 +
            SERVICE_FEE_FIXED_CENTS,
    );
};

export const formatUsdCents = (amountCents: number): string =>
    (amountCents / 100).toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
    });
