import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import Stripe from "stripe";
import { POLLEN_PACKS, type PollenPack } from "../../shared/pollen-packs.ts";

const MANUAL_CURRENCIES = ["eur", "gbp", "inr"] as const;
type ManualCurrency = (typeof MANUAL_CURRENCIES)[number];
type ManualCurrencyOptions = NonNullable<
    Stripe.PriceCreateParams["currency_options"]
>;

// Admin-time manual Price seed rates. These are not checkout fallbacks;
// checkout references managed Stripe Price IDs and never computes FX.
const MANUAL_CURRENCY_SEED_RATES: Record<ManualCurrency, number> = {
    eur: 0.93,
    gbp: 0.79,
    inr: 85,
};

const DRY_RUN = process.argv.includes("--dry-run");

loadDotEnv(path.join(process.cwd(), ".dev.vars"));

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (!stripeSecretKey) {
    throw new Error(
        "STRIPE_SECRET_KEY is required. Run npm run decrypt-vars first or set it in the environment.",
    );
}

const stripe = new Stripe(stripeSecretKey, {
    apiVersion: "2025-12-15.clover",
});

for (const pack of POLLEN_PACKS) {
    await syncPackPrice(pack);
}

async function syncPackPrice(pack: PollenPack): Promise<void> {
    const existing = await findActivePrice(pack);
    const priceParams = {
        metadata: packMetadata(pack),
        nickname: pack.stripeLookupKey,
        tax_behavior: "inclusive" as const,
        currency_options: manualCurrencyOptions(pack),
    };

    if (existing) {
        assertExistingPriceCompatible(
            existing,
            pack,
            priceParams.currency_options,
        );

        log(
            `update ${pack.stripeLookupKey} (${existing.id}) with manual currency options`,
        );
        if (!DRY_RUN) {
            await stripe.prices.update(existing.id, priceParams);
            await updateProduct(existing.product, pack);
        }
        return;
    }

    log(`create ${pack.stripeLookupKey}`);
    if (DRY_RUN) return;

    const price = await stripe.prices.create({
        currency: "usd",
        unit_amount: pack.amountUsd * 100,
        lookup_key: pack.stripeLookupKey,
        product_data: {
            name: pack.checkoutName,
            tax_code: pack.taxCode,
            metadata: packMetadata(pack),
        },
        ...priceParams,
    });
    await updateProduct(price.product, pack);
}

async function findActivePrice(
    pack: PollenPack,
): Promise<Stripe.Price | undefined> {
    const prices = await stripe.prices.list({
        active: true,
        lookup_keys: [pack.stripeLookupKey],
        expand: ["data.currency_options"],
        limit: 1,
    });
    return prices.data[0];
}

async function updateProduct(
    product: string | Stripe.Product | Stripe.DeletedProduct,
    pack: PollenPack,
): Promise<void> {
    const productId = typeof product === "string" ? product : product.id;
    if (!productId) return;
    if (typeof product !== "string" && product.deleted) return;

    await stripe.products.update(productId, {
        name: pack.checkoutName,
        description: pack.checkoutDescription,
        images: [pack.checkoutImageUrl],
        tax_code: pack.taxCode,
        metadata: {
            ...packMetadata(pack),
            checkoutImageUrl: pack.checkoutImageUrl,
        },
    });
}

function manualCurrencyOptions(pack: PollenPack): ManualCurrencyOptions {
    return Object.fromEntries(
        MANUAL_CURRENCIES.map((currency) => [
            currency,
            {
                unit_amount: Math.round(
                    pack.amountUsd * 100 * MANUAL_CURRENCY_SEED_RATES[currency],
                ),
                tax_behavior: "inclusive",
            },
        ]),
    ) as ManualCurrencyOptions;
}

function assertExistingPriceCompatible(
    price: Stripe.Price,
    pack: PollenPack,
    desiredOptions: ManualCurrencyOptions,
): void {
    if (price.currency !== "usd") {
        throw new Error(
            `${pack.stripeLookupKey} exists with default currency ${price.currency}; create a replacement USD Price and transfer the lookup key.`,
        );
    }

    if (price.unit_amount !== pack.amountUsd * 100) {
        throw new Error(
            `${pack.stripeLookupKey} exists with USD amount ${price.unit_amount}; create a replacement Price and transfer the lookup key.`,
        );
    }

    const existingOptions = price.currency_options as
        | Partial<Record<ManualCurrency, { unit_amount?: number | null }>>
        | undefined;

    for (const currency of MANUAL_CURRENCIES) {
        const existingAmount = existingOptions?.[currency]?.unit_amount;
        const desiredAmount = desiredOptions[currency]?.unit_amount;

        if (
            existingAmount != null &&
            desiredAmount != null &&
            existingAmount !== desiredAmount
        ) {
            throw new Error(
                `${pack.stripeLookupKey} has ${currency.toUpperCase()} amount ${existingAmount}; create a replacement Price and transfer the lookup key.`,
            );
        }
    }
}

function packMetadata(pack: PollenPack): Record<string, string> {
    return {
        packKey: pack.packKey,
        packAmountUsd: String(pack.amountUsd),
        packPollenGrant: String(pack.pollenGrant),
        packBonusPollen: String(pack.bonusPollen),
    };
}

function loadDotEnv(filePath: string): void {
    if (!existsSync(filePath)) return;

    for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;

        const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
        if (!match) continue;

        const [, key, rawValue] = match;
        if (process.env[key] != null) continue;

        process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
    }
}

function log(message: string): void {
    console.log(`${DRY_RUN ? "[dry-run] " : ""}${message}`);
}
