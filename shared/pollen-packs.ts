import { PUBLIC_URLS } from "./public-urls.ts";

export type PollenPackAmount = "2" | "5" | "10" | "20" | "50" | "100";
export type PollenPackKey = "p2" | "p5" | "p10" | "p20" | "p50" | "p100";

export type PollenPack = {
    packKey: PollenPackKey;
    amountUsd: number;
    bonusPollen: number;
    pollenGrant: number;
    checkoutName: string;
    checkoutDescription: string;
    checkoutImageUrl: string;
    taxCode: string;
};

const CHECKOUT_IMAGE_URL = `${PUBLIC_URLS.enter.production}/checkout/pollen-pack.png`;
const POLLEN_TAX_CODE = "txcd_10103001";
const CHECKOUT_FEEDBACK_URL = "https://discord.gg/z5uMbEYK";

// USD is the canonical reference: 1 pollen ≈ $1. Non-USD cohorts derive their
// integration-currency amount from amountUsd × current FX rate at session
// creation (see getPackEurCents + fx-cache).
const BASE_POLLEN_PACKS: ReadonlyArray<{
    packKey: PollenPackKey;
    amountUsd: number;
    bonusPollen: number;
}> = [
    { packKey: "p2", amountUsd: 2, bonusPollen: 0 },
    { packKey: "p5", amountUsd: 5, bonusPollen: 1 },
    { packKey: "p10", amountUsd: 10, bonusPollen: 3 },
    { packKey: "p20", amountUsd: 20, bonusPollen: 8 },
    { packKey: "p50", amountUsd: 50, bonusPollen: 25 },
    { packKey: "p100", amountUsd: 100, bonusPollen: 60 },
];

const PACK_AMOUNT_SET = new Set<PollenPackAmount>(
    BASE_POLLEN_PACKS.map(
        ({ amountUsd }) => String(amountUsd) as PollenPackAmount,
    ),
);

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

export const POLLEN_PACKS: ReadonlyArray<PollenPack> = BASE_POLLEN_PACKS.map(
    ({ packKey, amountUsd, bonusPollen }) => {
        const pollenGrant = amountUsd + bonusPollen;
        const hasBonus = bonusPollen > 0;
        const checkoutName = hasBonus
            ? `🪷 ${formatPollenPackValue(amountUsd)} Pollen + ${formatPollenPackValue(bonusPollen)} FREE`
            : `🪷 ${formatPollenPackValue(amountUsd)} Pollen`;
        const checkoutDescription = hasBonus
            ? `Tiny bits of creative energy for pollinations.ai 🌱 We’re still in beta, so this pack includes ${formatPollenPackValue(bonusPollen)} extra Pollen when you buy ${formatPollenPackValue(amountUsd)}. Feedback: ${CHECKOUT_FEEDBACK_URL}`
            : `Tiny bits of creative energy for pollinations.ai 🌱 Feedback: ${CHECKOUT_FEEDBACK_URL}`;

        return {
            packKey,
            amountUsd,
            bonusPollen,
            pollenGrant,
            checkoutName,
            checkoutDescription,
            checkoutImageUrl: CHECKOUT_IMAGE_URL,
            taxCode: POLLEN_TAX_CODE,
        };
    },
);

// Derive a foreign-currency-cents integration amount from a pack's USD
// reference price and a USD→target FX rate. Used at Stripe Checkout creation
// for non-USD cohorts (EUR, INR, GBP, ...); the USD cohort sends amountUsd
// directly without an FX call.
export const getPackForeignCents = (
    pack: PollenPack,
    usdToTargetRate: number,
): number => Math.round(pack.amountUsd * 100 * usdToTargetRate);

export const isPollenPackAmount = (value: string): value is PollenPackAmount =>
    PACK_AMOUNT_SET.has(value as PollenPackAmount);

export const isPollenPackKey = (value: string): value is PollenPackKey =>
    PACK_KEY_SET.has(value as PollenPackKey);

export const getPollenPack = (value: string | number): PollenPack | undefined =>
    POLLEN_PACKS.find((pack) => String(pack.amountUsd) === String(value));

export const getPollenPackByKey = (packKey: string): PollenPack | undefined =>
    POLLEN_PACKS.find((pack) => pack.packKey === packKey);

/**
 * Resolve a checkout URL parameter to a pack.
 * Accepts the new packKey form ("p2".."p100") and the legacy USD-amount form
 * ("2".."100") so existing buy-pollen links keep working through the transition.
 */
export const resolvePollenPack = (value: string): PollenPack | undefined => {
    if (isPollenPackKey(value)) return getPollenPackByKey(value);
    if (isPollenPackAmount(value)) return getPollenPack(value);
    return undefined;
};

export const describePollenPack = (pack: PollenPack): string => {
    const bonusSuffix =
        pack.bonusPollen > 0
            ? ` (+${formatPollenPackValue(pack.bonusPollen)} bonus)`
            : "";
    return `$${pack.amountUsd} -> ${formatPollenPackValue(pack.pollenGrant)} pollen${bonusSuffix}`;
};

export const getPackBonusPercent = (pack: PollenPack): number =>
    pack.amountUsd > 0
        ? Math.round((pack.bonusPollen / pack.amountUsd) * 100)
        : 0;
