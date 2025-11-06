import { Polar } from "@polar-sh/sdk";
import { command, number, run, string, boolean } from "@drizzle-team/brocli";
import { inspect } from "node:util";

const VERSION = "v1";

const polarAccessToken = process.env["POLAR_ACCESS_TOKEN"];
if (!polarAccessToken) {
    throw new Error("POLAR_ACCESS_TOKEN environment variable is required");
}

function createPolarClient(server: "sandbox" | "production") {
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
    amount: number;
    meterId: string;
};

async function createPollenTierBenefit(
    polar: Polar,
    { amount, meterId }: CreatePollenTierBenefitOptions,
) {
    if (amount % 1 !== 0) {
        throw new Error("Amount must be an integer");
    }
    const formattedAmount = amount.toLocaleString("en-US", {
        maximumFractionDigits: 0,
    });
    return await polar.benefits.create({
        type: "meter_credit",
        description: `Grant ${formattedAmount} pollen without rollover.`,
        properties: {
            meterId,
            units: amount,
            rollover: false,
        },
        metadata: {
            slug: `${VERSION}:benefit:tier:${formattedAmount}`,
        },
    });
}

type CreatePollenPackProductOptions = {
    name: string;
    amount: number;
    benefits: string[];
};

async function createPollenTierProductAndBenefit(
    polar: Polar,
    { name, amount, benefits }: CreatePollenPackProductOptions,
) {
    if (amount % 1 !== 0) {
        throw new Error("Amount must be an integer");
    }
    const formattedAmount = amount.toLocaleString("en-US", {
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

const meterList = command({
    name: "list",
    options: {
        env: string().enum("staging", "production").default("staging"),
        showArchived: boolean().default(false),
    },
    handler: async (opts) => {
        const server = opts.env === "production" ? "production" : "sandbox";
        const polar = createPolarClient(server);
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
        const server = opts.env === "production" ? "production" : "sandbox";
        const polar = createPolarClient(server);
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
        const server = opts.env === "production" ? "production" : "sandbox";
        const polar = createPolarClient(server);
        const response = await createPollenMeter(polar, {
            name: opts.name,
            type: opts.type,
            priority: opts.priority,
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
        const server = opts.env === "production" ? "production" : "sandbox";
        const polar = createPolarClient(server);
        const benefits = opts.benefits
            .split(",")
            .map((benefit) => benefit.trim());
        const response = await createPollenTierProductAndBenefit(polar, {
            name: opts.name,
            amount: opts.amount,
            benefits,
        });
        console.log(inspect(response, false, 1000));
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
];

run(commands);
