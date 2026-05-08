export type PollenPackAmount = "2" | "5" | "10" | "20" | "50" | "100";

export type PollenPack = {
    amountUsd: number;
    bonusPollen: number;
    pollenGrant: number;
    checkoutName: string;
    checkoutDescription: string;
    checkoutImageUrl: string;
    taxCode: string;
};

const CHECKOUT_IMAGE_URL =
    "https://enter.pollinations.ai/checkout/pollen-pack.png";
const POLLEN_TAX_CODE = "txcd_10103001";
const CHECKOUT_FEEDBACK_URL = "https://discord.gg/z5uMbEYK";

const BASE_POLLEN_PACKS: ReadonlyArray<{
    amountUsd: number;
    bonusPollen: number;
}> = [
    { amountUsd: 2, bonusPollen: 0 },
    { amountUsd: 5, bonusPollen: 0.5 },
    { amountUsd: 10, bonusPollen: 2 },
    { amountUsd: 20, bonusPollen: 6 },
    { amountUsd: 50, bonusPollen: 20 },
    { amountUsd: 100, bonusPollen: 50 },
];

const PACK_AMOUNT_SET = new Set<PollenPackAmount>(
    BASE_POLLEN_PACKS.map(
        ({ amountUsd }) => String(amountUsd) as PollenPackAmount,
    ),
);

export const formatPollenPackValue = (value: number): string =>
    Number.isInteger(value)
        ? value.toLocaleString("en-US")
        : value.toLocaleString("en-US", {
              minimumFractionDigits: 1,
              maximumFractionDigits: 1,
          });

export const POLLEN_PACKS: ReadonlyArray<PollenPack> = BASE_POLLEN_PACKS.map(
    ({ amountUsd, bonusPollen }) => {
        const pollenGrant = amountUsd + bonusPollen;
        const hasBonus = bonusPollen > 0;
        const bonusSuffix = hasBonus
            ? ` + ${formatPollenPackValue(bonusPollen)} FREE`
            : "";
        const bonusSentence = hasBonus
            ? ` We’re still in beta, so this pack includes ${formatPollenPackValue(bonusPollen)} extra Pollen when you buy ${formatPollenPackValue(amountUsd)}.`
            : "";

        return {
            amountUsd,
            bonusPollen,
            pollenGrant,
            checkoutName: `🪷 ${formatPollenPackValue(amountUsd)} Pollen${bonusSuffix}`,
            checkoutDescription: `Tiny bits of creative energy for pollinations.ai 🌱${bonusSentence} Feedback: ${CHECKOUT_FEEDBACK_URL}`,
            checkoutImageUrl: CHECKOUT_IMAGE_URL,
            taxCode: POLLEN_TAX_CODE,
        };
    },
);

export const isPollenPackAmount = (value: string): value is PollenPackAmount =>
    PACK_AMOUNT_SET.has(value as PollenPackAmount);

export const getPollenPack = (value: string | number): PollenPack | undefined =>
    POLLEN_PACKS.find((pack) => String(pack.amountUsd) === String(value));

export const describePollenPack = (pack: PollenPack): string =>
    `$${pack.amountUsd} -> ${formatPollenPackValue(pack.pollenGrant)} pollen (+${formatPollenPackValue(pack.bonusPollen)} bonus)`;

export const getPackBonusPercent = (pack: PollenPack): number =>
    pack.amountUsd > 0
        ? Math.round((pack.bonusPollen / pack.amountUsd) * 100)
        : 0;
