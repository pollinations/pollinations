import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Polar } from "@polar-sh/sdk";
import { command, number, run, string, boolean } from "@drizzle-team/brocli";
import { inspect } from "node:util";

const __dirname = dirname(fileURLToPath(import.meta.url));

function secretsFile(environment: string) {
    return join(__dirname, "..", `.encrypted.${environment}.env`);
}

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
    slug: string;
    priority: number;
};

async function createPollenMeter(
    polar: Polar,
    { name, slug, priority }: CreateMeterOptions,
) {
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
    slug: string;
    priority: number;
};

async function updatePollenMeter(
    polar: Polar,
    { id, slug, priority }: UpdateMeterOptions,
) {
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

const list = command({
    name: "list",
    options: {
        env: string().enum("staging", "production").default("staging"),
        showArchived: boolean().default(false),
    },
    handler: async (opts) => {
        const server = opts.env === "production" ? "production" : "sandbox";
        const polar = createPolarClient(server);
        const response = await polar.meters.list({});
        const meters = response.result.items.filter(
            (meter) => meter.archivedAt === null || opts.showArchived,
        );
        console.log(inspect(meters, false, 1000));
    },
});

const update = command({
    name: "update",
    options: {
        id: string().required(),
        slug: string().required(),
        priority: number().required(),
        env: string().enum("staging", "production").default("staging"),
    },
    handler: async (opts) => {
        const server = opts.env === "production" ? "production" : "sandbox";
        const polar = createPolarClient(server);
        const response = await updatePollenMeter(polar, {
            id: opts.id,
            slug: opts.slug,
            priority: opts.priority,
        });
        console.log(inspect(response, false, 1000));
    },
});

const create = command({
    name: "create",
    options: {
        name: string().required(),
        slug: string().required(),
        priority: number().required(),
        env: string().enum("staging", "production").default("staging"),
    },
    handler: async (opts) => {
        const server = opts.env === "production" ? "production" : "sandbox";
        const polar = createPolarClient(server);
        const response = await createPollenMeter(polar, {
            name: opts.name,
            slug: opts.slug,
            priority: opts.priority,
        });
        console.log(inspect(response, false, 1000));
    },
});

run([update, list, create]);
