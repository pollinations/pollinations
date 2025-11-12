import { Polar } from "@polar-sh/sdk";
import { command, number, run, string, boolean } from "@drizzle-team/brocli";
import { inspect } from "node:util";
import { applyColor, applyStyle } from "../src/util.ts";

const VERSION = "v1";

const polarAccessToken = process.env["POLAR_ACCESS_TOKEN"];
if (!polarAccessToken) {
    throw new Error("POLAR_ACCESS_TOKEN environment variable is required");
}

function createPolarClient(env: "staging" | "production") {
    const server = env === "production" ? "production" : "sandbox";
    return new Polar({
        accessToken: polarAccessToken,
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

type CreatePollenTierBenefitOptions = {
    pollenGrantAmount: number;
    meterId: string;
};

async function createPollenTierBenefit(
    polar: Polar,
    { pollenGrantAmount, meterId }: CreatePollenTierBenefitOptions,
) {
    if (pollenGrantAmount % 1 !== 0) {
        throw new Error("Amount must be an integer");
    }
    const formattedAmount = pollenGrantAmount.toLocaleString("en-US", {
        maximumFractionDigits: 0,
    });
    return await polar.benefits.create({
        type: "meter_credit",
        description: `Grant ${formattedAmount} pollen without rollover.`,
        properties: {
            meterId,
            units: pollenGrantAmount,
            rollover: false,
        },
        metadata: {
            slug: `${VERSION}:benefit:tier:${formattedAmount}`,
        },
    });
}

type CreatePollenPackProductOptions = {
    name: string;
    pollenGrantAmount: number;
    benefits: string[];
};

async function createPollenTierProduct(
    polar: Polar,
    { name, pollenGrantAmount, benefits }: CreatePollenPackProductOptions,
) {
    if (pollenGrantAmount % 1 !== 0) {
        throw new Error("Amount must be an integer");
    }
    const formattedAmount = pollenGrantAmount.toLocaleString("en-US", {
        maximumFractionDigits: 0,
    });
    const product = await polar.products.create({
        name,
        description: `Grant ${formattedAmount} pollen per day, without rollover.`,
        prices: [{ amountType: "free" }],
        recurringInterval: "day",
        metadata: {
            slug: `${VERSION}:product:tier:${formattedAmount}`,
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

type CreateAllPollenBenefitsAndProductsOptions = {
    tierMeterId: string;
    tiers: {
        name: string;
        pollenGrantAmount: number;
    }[];
};

async function createPollenTierBenefitsAndProducts(
    polar: Polar,
    { tierMeterId, tiers }: CreateAllPollenBenefitsAndProductsOptions,
) {
    const createdProducts: any[] = [];
    for (const tier of tiers) {
        const benefit = await createPollenTierBenefit(polar, {
            pollenGrantAmount: tier.pollenGrantAmount,
            meterId: tierMeterId,
        });
        const product = await createPollenTierProduct(polar, {
            name: tier.name,
            pollenGrantAmount: tier.pollenGrantAmount,
            benefits: [benefit.id],
        });
        createdProducts.push(product);
    }
    console.log(inspect(createdProducts, false, 1000));
}

const TIERS = [
    {
        name: "Seed",
        pollenGrantAmount: 10,
    },
    {
        name: "Flower",
        pollenGrantAmount: 15,
    },
    {
        name: "Nectar",
        pollenGrantAmount: 20,
    },
];

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

const customerMeterList = command({
    name: "list-meters",
    options: {
        userId: string().required(),
        env: string().enum("staging", "production").default("staging"),
    },
    handler: async (opts) => {
        const polar = createPolarClient(opts.env);
        const response = await polar.customerMeters.list({
            limit: 100,
            externalCustomerId: opts.userId,
        });
        console.log(inspect(response, false, 1000));
    },
});

const productCreate = command({
    name: "create",
    options: {
        name: string().required(),
        amount: number().required(),
        benefits: string().required(),
        env: string().enum("staging", "production").default("staging"),
    },
    handler: async (opts) => {
        const polar = createPolarClient(opts.env);
        const benefits = opts.benefits
            .split(",")
            .map((benefit) => benefit.trim());
        const response = await createPollenTierProduct(polar, {
            name: opts.name,
            pollenGrantAmount: opts.amount,
            benefits,
        });
        console.log(inspect(response, false, 1000));
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
        const products = await createPollenTierBenefitsAndProducts(polar, {
            tiers: TIERS,
            tierMeterId: opts.meterId,
        });
        console.log(inspect(products, false, 1000));
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

const commands = [
    command({
        name: "meter",
        subcommands: [meterUpdate, meterList, meterCreate],
    }),
    command({
        name: "product",
        subcommands: [productCreate],
    }),
    command({ name: "subscriptions", subcommands: [subscriptionList] }),
    command({
        name: "tier",
        subcommands: [tierCreateProducts, tierUpdateSubscriptions],
    }),
    command({
        name: "customer",
        subcommands: [customerMeterList],
    }),
];

run(commands);
