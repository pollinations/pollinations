import { inspect } from "node:util";
import { boolean, command, number, run, string } from "@drizzle-team/brocli";
import { Polar } from "@polar-sh/sdk";
import { applyColor, applyStyle } from "../src/util.ts";

const VERSION = "v1";

const TIERS = [
    {
        name: "🦠 Spore",
        slug: "spore",
        pollenGrantAmount: 1,
    },
    {
        name: "🌱 Seed",
        slug: "seed",
        pollenGrantAmount: 3,
    },
    {
        name: "🌸 Flower",
        slug: "flower",
        pollenGrantAmount: 10,
    },
    {
        name: "🍯 Nectar",
        slug: "nectar",
        pollenGrantAmount: 20,
    },
];

const PACKS = [
    {
        pollenGrantAmount: 5,
    },
    {
        pollenGrantAmount: 10,
    },
    {
        pollenGrantAmount: 20,
    },
    {
        pollenGrantAmount: 50,
    },
];

const polarAccessToken = (env: "staging" | "production") => {
    if (env === "production") {
        if (!process.env.POLAR_ACCESS_TOKEN) {
            throw new Error(
                "POLAR_ACCESS_TOKEN environment variable is required",
            );
        }
        return process.env.POLAR_ACCESS_TOKEN;
    } else {
        if (!process.env.POLAR_SANDBOX_ACCESS_TOKEN) {
            throw new Error(
                "POLAR_SANDBOX_ACCESS_TOKEN environment variable is required",
            );
        }
        return process.env.POLAR_SANDBOX_ACCESS_TOKEN;
    }
};

// Note: polarAccessToken is a function - validation happens when called

function createPolarClient(env: "staging" | "production") {
    const server = env === "production" ? "production" : "sandbox";
    return new Polar({
        accessToken: polarAccessToken(env),
        server,
    });
}

type CreateMeterOptions = {
    name: string;
    type: "tier" | "pack";
    priority: number;
};

async function createPollenMeter(
    polar: Polar,
    { name, type, priority }: CreateMeterOptions,
) {
    const slug = `${VERSION}:meter:${type}`;
    return await polar.meters.create({
        name,
        filter: {
            conjunction: "and",
            clauses: [
                {
                    conjunction: "or",
                    clauses: [
                        {
                            property: "name",
                            operator: "eq",
                            value: "generate.text",
                        },
                        {
                            property: "name",
                            operator: "eq",
                            value: "generate.image",
                        },
                    ],
                },
                {
                    property: "selectedMeterSlug",
                    operator: "eq",
                    value: slug,
                },
            ],
        },
        aggregation: {
            property: "totalPrice",
            func: "sum",
        },
        metadata: {
            slug,
            priority,
        },
    });
}

type UpdateMeterOptions = {
    id: string;
    type: "tier" | "pack";
    priority: number;
};

async function updatePollenMeter(
    polar: Polar,
    { id, type, priority }: UpdateMeterOptions,
) {
    const slug = `${VERSION}:meter:${type}`;
    return await polar.meters.update({
        id,
        meterUpdate: {
            filter: {
                conjunction: "and",
                clauses: [
                    {
                        conjunction: "or",
                        clauses: [
                            {
                                property: "name",
                                operator: "eq",
                                value: "generate.text",
                            },
                            {
                                property: "name",
                                operator: "eq",
                                value: "generate.image",
                            },
                        ],
                    },
                    {
                        property: "selectedMeterSlug",
                        operator: "eq",
                        value: slug,
                    },
                ],
            },
            aggregation: {
                property: "totalPrice",
                func: "sum",
            },
            metadata: {
                slug,
                priority,
            },
        },
    });
}

type CreatePollenPackBenefitOptions = {
    pollenGrantAmount: number;
    pollenGrantMultiplier?: number;
    meterId: string;
};

async function createPollenPackBenefit(
    polar: Polar,
    {
        pollenGrantAmount,
        pollenGrantMultiplier,
        meterId,
    }: CreatePollenPackBenefitOptions,
) {
    if (pollenGrantAmount % 1 !== 0) {
        throw new Error("Amount must be an integer");
    }
    const formattedAmount = pollenGrantAmount.toLocaleString("en-US", {
        maximumFractionDigits: 0,
    });
    const formattedMultiplier = pollenGrantMultiplier?.toLocaleString("en-US", {
        maximumFractionDigits: 2,
    });
    const formattedAmountWithMultiplier = formattedMultiplier
        ? `${formattedAmount}x${formattedMultiplier}`
        : formattedAmount;
    const totalPollenGrantAmount =
        pollenGrantAmount * (pollenGrantMultiplier || 1);
    return await polar.benefits.create({
        type: "meter_credit",
        description: `${formattedAmountWithMultiplier} pollen`,
        properties: {
            meterId,
            units: totalPollenGrantAmount,
            rollover: true,
        },
        metadata: {
            slug: `${VERSION}:benefit:pack:${formattedAmountWithMultiplier}`,
        },
    });
}

type CreatePollenPackProductOptions = {
    pollenGrantAmount: number;
    pollenGrantMultiplier?: number;
    benefits: string[];
};

async function createPollenPackProduct(
    polar: Polar,
    {
        pollenGrantAmount,
        pollenGrantMultiplier,
        benefits,
    }: CreatePollenPackProductOptions,
) {
    if (pollenGrantAmount % 1 !== 0) {
        throw new Error("Amount must be an integer");
    }
    const formattedAmount = pollenGrantAmount.toLocaleString("en-US", {
        maximumFractionDigits: 0,
    });
    const formattedMultiplier = pollenGrantMultiplier?.toLocaleString("en-US", {
        maximumFractionDigits: 2,
    });
    const formattedAmountWithMultiplier = formattedMultiplier
        ? `${formattedAmount}x${formattedMultiplier}`
        : formattedAmount;
    const name = `🐝 ${formattedAmountWithMultiplier} pollen (pack)`;
    const product = await polar.products.create({
        name,
        description: `Grants ${formattedAmountWithMultiplier} pollen.`,
        prices: [
            {
                amountType: "fixed",
                // polar expects the price in cents
                priceAmount: pollenGrantAmount * 100,
                priceCurrency: "usd",
            },
        ],
        metadata: {
            slug: `${VERSION}:product:pack:${formattedAmountWithMultiplier}`,
        },
    });
    const updatedProduct = await polar.products.updateBenefits({
        id: product.id,
        productBenefitsUpdate: {
            benefits,
        },
    });
    return updatedProduct;
}

type CreatePollenTierBenefitOptions = {
    tierSlug: string;
    pollenGrantAmount: number;
    meterId: string;
};

async function createPollenTierBenefit(
    polar: Polar,
    { tierSlug, pollenGrantAmount, meterId }: CreatePollenTierBenefitOptions,
) {
    if (pollenGrantAmount % 1 !== 0) {
        throw new Error("Amount must be an integer");
    }
    const formattedAmount = pollenGrantAmount.toLocaleString("en-US", {
        maximumFractionDigits: 0,
    });
    return await polar.benefits.create({
        type: "meter_credit",
        description: `${formattedAmount} pollen/day`,
        properties: {
            meterId,
            units: pollenGrantAmount,
            rollover: false,
        },
        metadata: {
            slug: `${VERSION}:benefit:tier:${tierSlug}`,
        },
    });
}

type CreatePollenTierProductOptions = {
    name: string;
    tierSlug: string;
    pollenGrantAmount: number;
    benefits: string[];
};

async function createPollenTierProduct(
    polar: Polar,
    {
        name,
        tierSlug,
        pollenGrantAmount,
        benefits,
    }: CreatePollenTierProductOptions,
) {
    if (pollenGrantAmount % 1 !== 0) {
        throw new Error("Amount must be an integer");
    }
    const formattedAmount = pollenGrantAmount.toLocaleString("en-US", {
        maximumFractionDigits: 0,
    });
    const product = await polar.products.create({
        name,
        description: `Grants ${formattedAmount} pollen per day, without rollover.`,
        prices: [{ amountType: "free" }],
        recurringInterval: "day",
        metadata: {
            slug: `${VERSION}:product:tier:${tierSlug}`,
        },
    });
    const updatedProduct = await polar.products.updateBenefits({
        id: product.id,
        productBenefitsUpdate: {
            benefits,
        },
    });
    return updatedProduct;
}

type UpdateSubscriptionOptions = {
    subscriptionId: string;
    productId: string;
};

const UPDATE_SUBSCRIPTION_PRODUCTS = [
    // Seed
    {
        currentProductId: "82ee54e1-5b69-447b-82aa-3c76bccae193",
        updatedProductId: "5cbd2495-dba1-4840-8465-46afd9b16679",
    },
    // Flower
    {
        currentProductId: "2bfbe9e0-8395-489f-a7a1-6821d835cc08",
        updatedProductId: "ea33ef88-67ff-45d8-906e-bb9357dd549a",
    },
    // Nectar
    {
        currentProductId: "d67b2a25-c4d7-47fa-9d64-4b2a27f0908f",
        updatedProductId: "10167875-38e1-459f-8241-106aafc3062c",
    },
] as const;

async function updateSubscriptionProducts(
    polar: Polar,
    config: typeof UPDATE_SUBSCRIPTION_PRODUCTS,
    apply: boolean,
) {
    const tierMap = Object.fromEntries(
        config.map((item) => [item.currentProductId, item.updatedProductId]),
    );
    const results: any[] = [];
    const paginator = await polar.subscriptions.list({ limit: 100 });
    for await (const page of paginator) {
        for (const sub of page.result.items) {
            const coloredEmail = applyColor("blue", sub.customer.email);
            const subscriptionDetails = applyStyle(
                "dim",
                [
                    `  subscription.productId: ${sub.productId}`,
                    `  updated.productId: ${tierMap[sub.productId]}`,
                ].join("\n"),
            );
            console.log(`Processing subscription for user: ${coloredEmail}`);
            if (tierMap[sub.productId]) {
                if (sub.status !== "active") {
                    console.log(`  Skipping inactive subscription: ${sub.id}`);
                    continue;
                }
                console.log(
                    `  ${applyColor("green", "Updating subscription product:")}\n${subscriptionDetails}`,
                );
                if (apply) {
                    try {
                        const result = await polar.subscriptions.update({
                            id: sub.id,
                            subscriptionUpdate: {
                                productId: tierMap[sub.productId],
                                prorationBehavior: "prorate",
                            },
                        });
                        results.push(result);
                    } catch (e) {
                        const message = [
                            `  Failed to update subscription: ${sub.id}\n`,
                            `  ${e.message}`,
                        ];
                        console.error(
                            ...message.map((line) => applyColor("red", line)),
                        );
                    }
                    // wait a bit as a precaution to not hit the rate limit
                    await new Promise((resolve) => setTimeout(resolve, 100));
                }
            } else {
                console.log(
                    `  Product does not match:\n${subscriptionDetails}`,
                );
            }
            console.log();
        }
    }
    return results;
}

async function updateSubscription(
    polar: Polar,
    { subscriptionId, productId }: UpdateSubscriptionOptions,
) {
    const updatedSubscription = await polar.subscriptions.update({
        id: subscriptionId,
        subscriptionUpdate: {
            productId,
        },
    });
    return updatedSubscription;
}

const meterList = command({
    name: "list",
    options: {
        env: string().enum("staging", "production").default("staging"),
        showArchived: boolean().default(false),
    },
    handler: async (opts) => {
        const polar = createPolarClient(opts.env);
        const response = await polar.meters.list({ limit: 1000 });
        const meters = response.result.items.filter(
            (meter) => meter.archivedAt === null || opts.showArchived,
        );
        console.log(inspect(meters, false, 1000));
    },
});

const meterUpdate = command({
    name: "update",
    options: {
        id: string().required(),
        type: string().enum("tier", "pack").required(),
        priority: number().required(),
        env: string().enum("staging", "production").default("staging"),
    },
    handler: async (opts) => {
        const polar = createPolarClient(opts.env);
        const response = await updatePollenMeter(polar, {
            id: opts.id,
            type: opts.type,
            priority: opts.priority,
        });
        console.log(inspect(response, false, 1000));
    },
});

const meterCreate = command({
    name: "create",
    options: {
        name: string().required(),
        type: string().enum("tier", "pack").required(),
        priority: number().required(),
        env: string().enum("staging", "production").default("staging"),
    },
    handler: async (opts) => {
        const polar = createPolarClient(opts.env);
        const response = await createPollenMeter(polar, {
            name: opts.name,
            type: opts.type,
            priority: opts.priority,
        });
        console.log(inspect(response, false, 1000));
    },
});

const customerListMeters = command({
    name: "list-meters",
    options: {
        email: string().required(),
        env: string().enum("staging", "production").default("staging"),
    },
    handler: async (opts) => {
        const polar = createPolarClient(opts.env);
        const getCustomerReponse = await polar.customers.list({
            limit: 100,
            email: opts.email,
        });
        const customer = getCustomerReponse.result.items[0];
        if (!customer) {
            throw new Error("Customer not found");
        }
        const response = await polar.customerMeters.list({
            limit: 100,
            customerId: customer.id,
        });
        console.log(inspect(response.result.items, false, 1000));
    },
});

const customerListEvents = command({
    name: "list-events",
    options: {
        email: string().required(),
        env: string().enum("staging", "production").default("staging"),
    },
    handler: async (opts) => {
        const polar = createPolarClient(opts.env);
        const getCustomerReponse = await polar.customers.list({
            limit: 100,
            email: opts.email,
        });
        const customer = getCustomerReponse.result.items[0];
        if (!customer) {
            throw new Error("Customer not found");
        } else {
            console.log(`Found customer id: ${customer.id}`);
        }
        const response = await polar.events.list({
            limit: 100,
            customerId: customer.id,
        });
        console.log(inspect(response.result.items, false, 1000));
    },
});

const subscriptionList = command({
    name: "list",
    options: {
        env: string().enum("staging", "production").default("staging"),
    },
    handler: async (opts) => {
        const polar = createPolarClient(opts.env);
        const subscriptions = await polar.subscriptions.list({ limit: 100000 });
        const activeSub = subscriptions.result.items.find((sub) =>
            sub.customer.email.startsWith("pollen"),
        );
        if (!activeSub) throw new Error("No active subscription found.");
        const result = await polar.subscriptions.update({
            id: activeSub.id,
            subscriptionUpdate: {
                productId: activeSub.productId,
                prorationBehavior: "prorate",
            },
        });
        console.log(inspect(result, false, 1000));
    },
});

const subscriptionUpdate = command({
    name: "update",
    options: {
        subscriptionId: string().required(),
        productId: string().required(),
        env: string().enum("staging", "production").default("staging"),
    },
    handler: async (opts) => {
        const polar = createPolarClient(opts.env);
        const subscription = await updateSubscription(polar, opts);
        console.log(inspect(subscription, false, 1000));
    },
});

const tierCreateProducts = command({
    name: "create-products",
    options: {
        meterId: string().required(),
        env: string().enum("staging", "production").default("staging"),
    },
    handler: async (opts) => {
        const polar = createPolarClient(opts.env);
        const createdProducts: any[] = [];
        for (const tier of TIERS) {
            const benefit = await createPollenTierBenefit(polar, {
                tierSlug: tier.slug,
                pollenGrantAmount: tier.pollenGrantAmount,
                meterId: opts.meterId,
            });
            const product = await createPollenTierProduct(polar, {
                name: tier.name,
                tierSlug: tier.slug,
                pollenGrantAmount: tier.pollenGrantAmount,
                benefits: [benefit.id],
            });
            createdProducts.push(product);
        }
        console.log(inspect(createdProducts, false, 1000));
    },
});

const tierUpdateSubscriptions = command({
    name: "update-subscriptions",
    options: {
        apply: boolean().default(false),
        env: string().enum("staging", "production").default("staging"),
    },
    handler: async (opts) => {
        const polar = createPolarClient(opts.env);
        const results = await updateSubscriptionProducts(
            polar,
            UPDATE_SUBSCRIPTION_PRODUCTS,
            opts.apply,
        );
        console.log(inspect(results, false, 1000));
    },
});

const packCreateProducts = command({
    name: "create-products",
    options: {
        meterId: string().required(),
        multiplier: number(),
        env: string().enum("staging", "production").default("staging"),
    },
    handler: async (opts) => {
        const polar = createPolarClient(opts.env);
        const createdProducts: any[] = [];
        for (const pack of PACKS) {
            const benefit = await createPollenPackBenefit(polar, {
                pollenGrantAmount: pack.pollenGrantAmount,
                pollenGrantMultiplier: opts.multiplier,
                meterId: opts.meterId,
            });
            const product = await createPollenPackProduct(polar, {
                pollenGrantAmount: pack.pollenGrantAmount,
                pollenGrantMultiplier: opts.multiplier,
                benefits: [benefit.id],
            });
            createdProducts.push(product);
        }
        console.log(inspect(createdProducts, false, 1000));
    },
});

const customerMigrate = command({
    name: "migrate",
    options: {
        apply: boolean().default(false),
        email: string(),
    },
    handler: async (opts) => {
        if (!opts.apply) {
            console.log("This is a dry run. Use --apply to apply changes.");
        }
        const polarSandbox = createPolarClient("staging");
        const polarProduction = createPolarClient("production");
        const paginator = await polarSandbox.customers.list({
            email: opts.email,
            limit: 100,
        });
        const createdCustomers: any[] = [];
        for await (const page of paginator) {
            for (const customer of page.result.items) {
                if (customer.deletedAt) {
                    console.log("Skipping deleted customer:", customer.email);
                    continue;
                }
                console.log("Processing customer:", customer.email);
                if (opts.apply) {
                    const createdCustomer = polarProduction.customers.create({
                        metadata: customer.metadata,
                        externalId: customer.externalId,
                        email: customer.email,
                        name: customer.name,
                    });
                    createdCustomers.push(createdCustomer);
                }
            }
        }
        console.log(inspect(paginator.result.items[0], false, 1000));
    },
});

const tierSlugMap = {
    "v1:product:tier:10": "v1:product:tier:seed",
    "v1:product:tier:15": "v1:product:tier:flower",
    "v1:product:tier:20": "v1:product:tier:nectar",
};

// Production tier product IDs
// Note: microbe tier doesn't have a Polar product (it's for flagged/suspicious users)
const TIER_PRODUCT_IDS = {
    production: {
        spore: "01a31c1a-7af7-4958-9b73-c10e2fac5f70",
        seed: "fe32ee28-c7c4-4e7a-87fa-6ffc062e3658",
        flower: "dfb4c4f6-2004-4205-a358-b1f7bb3b310e",
        nectar: "066f91a4-8ed1-4329-b5f7-3f71e992ed28",
        router: "0286ea62-540f-4b19-954f-b8edb9095c43",
    },
    staging: {
        spore: "19fa1660-a90c-453d-8132-4d228cc7db39",
        seed: "c6f94c1b-c119-4e59-9f18-59391c8afee3",
        flower: "18bdd5c4-dcb3-4a15-8ca6-1c0b45f76b84",
        nectar: "a438764a-c486-4ff4-8f85-e66199c6b26f",
        router: "9256189e-ad01-4608-8102-4ebfc4b506e0",
    },
} as const;

type TierName = "microbe" | "spore" | "seed" | "flower" | "nectar" | "router";

const userUpdateTier = command({
    name: "update-tier",
    desc: "Update a user's Polar subscription to a new tier (immediate, with proration)",
    options: {
        email: string().required().desc("User's email address"),
        tier: string()
            .enum("spore", "seed", "flower", "nectar", "router")
            .required()
            .desc("Target tier"),
        env: string().enum("staging", "production").default("production"),
        apply: boolean()
            .default(false)
            .desc("Apply changes to user's subscription"),
    },
    handler: async (opts) => {
        const polar = createPolarClient(opts.env);
        const tierProductIds = TIER_PRODUCT_IDS[opts.env];
        const targetProductId = tierProductIds[opts.tier as TierName];

        console.log(`Searching subscription for: ${opts.email}`);

        // First, look up customer by email (fast)
        const customerResponse = await polar.customers.list({
            email: opts.email,
            limit: 1,
        });
        const customer = customerResponse.result.items[0];
        if (!customer) {
            console.error(`No customer found for ${opts.email}`);
            return;
        }

        // Then filter subscriptions by customerId (fast)
        const subscriptionResponse = await polar.subscriptions.list({
            customerId: customer.id,
            active: true,
            limit: 1,
        });
        const subscription = subscriptionResponse.result.items[0];

        if (!subscription) {
            console.error(`No subscription found for ${opts.email}`);
            return;
        }

        console.log("Found subscription:");
        console.log(`   ID: ${subscription.id}`);
        console.log(`   Current: ${subscription.product.name}`);
        console.log(`   Status: ${subscription.status}`);

        if (subscription.productId === targetProductId) {
            console.log(`Already on ${opts.tier} tier`);
            return;
        }

        if (!opts.apply) {
            console.log(
                `Would update: ${subscription.product.name} → ${opts.tier}`,
            );
            console.log(`   (Use with --apply to make changes)`);
            return;
        }
        console.log(`Updating subscription...`);
        const result = await polar.subscriptions.update({
            id: subscription.id,
            subscriptionUpdate: {
                productId: targetProductId,
                prorationBehavior: "prorate",
            },
        });
        console.log(
            applyColor(
                "green",
                `Updated: ${subscription.product.name} → ${result.product.name}`,
            ),
        );
    },
});

const tierMigrate = command({
    name: "migrate",
    options: {
        apply: boolean().default(false),
        email: string(),
    },
    handler: async (opts) => {
        if (!opts.apply) {
            console.log("This is a dry run. Use --apply to make changes.");
        }
        const polarSandbox = createPolarClient("staging");
        const polarProduction = createPolarClient("production");
        const results: any[] = [];
        const filterCustomerResponse = await polarSandbox.customers.list({
            email: opts.email,
        });
        const filterCustomerId = filterCustomerResponse.result.items[0]?.id;
        const paginator = await polarSandbox.subscriptions.list({
            active: true,
            limit: 100,
            customerId: filterCustomerId,
        });
        for await (const page of paginator) {
            for (const sandboxSub of page.result.items) {
                console.log("Processing subscription:", sandboxSub.id);
                if (sandboxSub.status !== "active") {
                    console.log(
                        "Skipping inactive subscription:",
                        sandboxSub.id,
                    );
                    continue;
                }
                if (!sandboxSub.customer.externalId) {
                    console.log(
                        "Skipping subscription for customer without externalId:\n",
                        inspect(sandboxSub.customer, false, 1000),
                    );
                    continue;
                }
                const productionProduct = await polarProduction.products.list({
                    metadata: {
                        slug:
                            tierSlugMap[
                                sandboxSub.product.metadata.slug as string
                            ] || "undefined",
                    },
                });
                if (productionProduct.result.items.length !== 1) {
                    console.log(
                        "Failed to find matching product for slug:",
                        sandboxSub.product.metadata.slug,
                    );
                    continue;
                }
                console.log(
                    "Found matching product:",
                    productionProduct.result.items[0].name,
                );
                if (opts.apply) {
                    const productionSub =
                        await polarProduction.subscriptions.create({
                            productId: productionProduct.result.items[0].id,
                            externalCustomerId: sandboxSub.customer.externalId,
                        });
                    results.push(productionSub);
                }
            }
        }
        console.log(inspect(results, false, 1000));
    },
});

// Required webhook events for D1 balance tracking
const REQUIRED_WEBHOOK_EVENTS = [
    "subscription.created",
    "subscription.updated",
    "subscription.canceled",
    "subscription.revoked",
    "subscription.active",
    "subscription.uncanceled",
    "benefit_grant.created", // New subscription benefit grants
    "benefit_grant.updated", // Tier changes (upgrade/downgrade) - benefit gets updated
    "benefit_grant.cycled", // Daily pollen grants
    "order.paid", // Pollen pack purchases
] as const;

const WEBHOOK_URLS = {
    production: "https://enter.pollinations.ai/api/webhooks/polar",
    staging: "https://enter-staging.pollinations.ai/api/webhooks/polar",
} as const;

const webhookList = command({
    name: "list",
    options: {
        env: string().enum("staging", "production").default("staging"),
    },
    handler: async (opts) => {
        const polar = createPolarClient(opts.env);
        const endpoints = await polar.webhooks.listWebhookEndpoints({});
        for await (const page of endpoints) {
            for (const ep of page.result.items) {
                console.log(`ID: ${ep.id}`);
                console.log(`URL: ${ep.url}`);
                console.log(`Events: ${ep.events.join(", ")}`);
                console.log();
            }
        }
    },
});

const webhookSync = command({
    name: "sync",
    desc: "Ensure webhook endpoint exists with all required events",
    options: {
        env: string().enum("staging", "production").default("staging"),
        apply: boolean().default(false),
    },
    handler: async (opts) => {
        const polar = createPolarClient(opts.env);
        const expectedUrl = WEBHOOK_URLS[opts.env];

        console.log(`Checking webhook configuration for ${opts.env}...`);
        console.log(`Expected URL: ${expectedUrl}`);
        console.log(`Required events: ${REQUIRED_WEBHOOK_EVENTS.join(", ")}`);
        console.log();

        // Find existing endpoint
        let existingEndpoint: any = null;
        const endpoints = await polar.webhooks.listWebhookEndpoints({});
        for await (const page of endpoints) {
            for (const ep of page.result.items) {
                if (ep.url === expectedUrl) {
                    existingEndpoint = ep;
                    break;
                }
            }
        }

        if (existingEndpoint) {
            console.log(`Found existing endpoint: ${existingEndpoint.id}`);
            console.log(
                `Current events: ${existingEndpoint.events.join(", ")}`,
            );

            // Check for missing events
            const missingEvents = REQUIRED_WEBHOOK_EVENTS.filter(
                (e) => !existingEndpoint.events.includes(e),
            );
            const extraEvents = existingEndpoint.events.filter(
                (e: string) =>
                    !REQUIRED_WEBHOOK_EVENTS.includes(
                        e as (typeof REQUIRED_WEBHOOK_EVENTS)[number],
                    ),
            );

            if (missingEvents.length > 0) {
                console.log(
                    applyColor(
                        "red",
                        `Missing events: ${missingEvents.join(", ")}`,
                    ),
                );
            }
            if (extraEvents.length > 0) {
                console.log(
                    applyColor(
                        "yellow",
                        `Extra events: ${extraEvents.join(", ")}`,
                    ),
                );
            }

            if (missingEvents.length === 0 && extraEvents.length === 0) {
                console.log(
                    applyColor("green", "✓ Webhook configuration is correct"),
                );
                return;
            }

            if (opts.apply) {
                console.log("Updating webhook endpoint...");
                const updated = await polar.webhooks.updateWebhookEndpoint({
                    id: existingEndpoint.id,
                    webhookEndpointUpdate: {
                        events: [...REQUIRED_WEBHOOK_EVENTS],
                    },
                });
                console.log(
                    applyColor(
                        "green",
                        `✓ Updated webhook with events: ${updated.events.join(", ")}`,
                    ),
                );
            } else {
                console.log(
                    applyColor(
                        "yellow",
                        "Run with --apply to update the webhook",
                    ),
                );
            }
        } else {
            console.log(
                applyColor("red", "No webhook endpoint found for this URL"),
            );
            console.log(
                "Create one in the Polar dashboard or implement create command",
            );
        }
    },
});

const commands = [
    command({
        name: "meter",
        subcommands: [meterUpdate, meterList, meterCreate],
    }),
    command({ name: "subscriptions", subcommands: [subscriptionList] }),
    command({
        name: "tier",
        subcommands: [tierCreateProducts, tierUpdateSubscriptions, tierMigrate],
    }),
    command({
        name: "pack",
        subcommands: [packCreateProducts],
    }),
    command({
        name: "customer",
        subcommands: [customerMigrate, customerListMeters, customerListEvents],
    }),
    command({
        name: "user",
        subcommands: [userUpdateTier],
    }),
    command({
        name: "webhook",
        subcommands: [webhookList, webhookSync],
    }),
];

run(commands);
