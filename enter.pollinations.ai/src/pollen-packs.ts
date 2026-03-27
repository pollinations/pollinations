export type PollenPackAmount = "2" | "5" | "10" | "20" | "50" | "100";

export type PollenPack = {
    amountUsd: number;
    bonusPollen: number;
    pollenGrant: number;
    checkoutName: string;
    checkoutDescription: string;
};

const BASE_POLLEN_PACKS: ReadonlyArray<{
    amountUsd: number;
    bonusPollen: number;
}> = [
    { amountUsd: 2, bonusPollen: 0.5 },
    { amountUsd: 5, bonusPollen: 2 },
    { amountUsd: 10, bonusPollen: 5 },
    { amountUsd: 20, bonusPollen: 10 },
    { amountUsd: 50, bonusPollen: 40 },
    { amountUsd: 100, bonusPollen: 100 },
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

        return {
            amountUsd,
            bonusPollen,
            pollenGrant,
            checkoutName: `${formatPollenPackValue(pollenGrant)} Pollen`,
            checkoutDescription: `${formatPollenPackValue(amountUsd)} base + ${formatPollenPackValue(bonusPollen)} bonus during beta.`,
        };
    },
);

export const isPollenPackAmount = (value: string): value is PollenPackAmount =>
    PACK_AMOUNT_SET.has(value as PollenPackAmount);

export const getPollenPack = (value: string | number): PollenPack | undefined =>
    POLLEN_PACKS.find((pack) => String(pack.amountUsd) === String(value));

export const describePollenPack = (pack: PollenPack): string =>
    `$${pack.amountUsd} -> ${formatPollenPackValue(pack.pollenGrant)} pollen (+${formatPollenPackValue(pack.bonusPollen)} bonus)`;
