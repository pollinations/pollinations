// Offline policy only. Neither this module nor its output provisions resources.
const { isDeepStrictEqual } = require("node:util");

const SLOTS = ["pilot-a", "pilot-b"];
const CLASSES = [
    "CommunityModelRateLimiter",
    "GenerationCoordinator",
    "AzurePortWake",
];

function createPlan() {
    return {
        version: 1,
        environments: SLOTS.map((slot) => ({
            slot,
            workers: {
                enter: {
                    d1: "db",
                    kv: { KV: "kv", SETUP_HOLDS: "kv" },
                    services: {},
                },
                gen: {
                    d1: "db",
                    kv: { KV: "kv" },
                    r2: { TEXT_BUCKET: "text" },
                    services: { ENTER: "enter" },
                    durableObjects: [...CLASSES],
                },
            },
            resources: { d1: ["db"], kv: ["kv"], r2: ["text"] },
            routes: { enter: "enter", gen: "gen" },
        })),
    };
}

function exactKeys(value, keys, label) {
    if (
        !value ||
        typeof value !== "object" ||
        Array.isArray(value) ||
        Object.getPrototypeOf(value) !== Object.prototype ||
        !isDeepStrictEqual(Object.keys(value).sort(), [...keys].sort())
    ) {
        throw new Error(`invalid ${label} fields`);
    }
}

// Deliberately restrictive canonical subset, not a Cloudflare identifier parser.
function identifier(value, label) {
    if (
        typeof value !== "string" ||
        value.length > 253 ||
        !/^[a-z0-9]+(?:[a-z0-9.-]*[a-z0-9])?$/.test(value) ||
        value.includes("..") ||
        value.includes(".-") ||
        value.includes("-.")
    ) {
        throw new Error(`invalid ${label}`);
    }
    return value;
}

function route(value) {
    identifier(value, "route");
    if (
        value.split(".").length < 2 ||
        value
            .split(".")
            .some(
                (part) =>
                    part.length > 63 ||
                    !/^[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?$/.test(part),
            )
    ) {
        throw new Error("invalid route");
    }
    return value;
}

// approved and reserved are maintained outside branch control. All inputs must be
// plain JSON data, parsed once by the trusted caller; never merge branch objects.
function validate(plan, proposed, approved, reserved) {
    if (!isDeepStrictEqual(plan, createPlan()))
        throw new Error("invalid logical plan");
    if (!Array.isArray(reserved))
        throw new Error("reserved inventory required");
    const blocked = new Set(
        reserved.map((id) => identifier(id, "reserved identifier")),
    );
    const seen = new Set();
    exactKeys(approved, SLOTS, "approved allocations");
    for (const slot of SLOTS) {
        const allocation = approved[slot];
        exactKeys(allocation, ["workers", "d1", "kv", "r2", "routes"], slot);
        exactKeys(allocation.workers, ["enter", "gen"], `${slot} workers`);
        exactKeys(allocation.routes, ["enter", "gen"], `${slot} routes`);
        const values = [
            identifier(allocation.workers.enter, "worker"),
            identifier(allocation.workers.gen, "worker"),
            identifier(allocation.d1, "d1"),
            identifier(allocation.kv, "kv"),
            identifier(allocation.r2, "r2"),
            route(allocation.routes.enter),
            route(allocation.routes.gen),
        ];
        for (const value of values) {
            // Broad collision rule, even across resource kinds, avoids ambiguity.
            if (seen.has(value))
                throw new Error(`colliding identifier: ${value}`);
            if (blocked.has(value))
                throw new Error(`reserved identifier: ${value}`);
            // Reserved words are defense in depth, not an inventory of unsafe IDs.
            if (/(^|[.-])(prod|production|staging)([.-]|$)/.test(value)) {
                throw new Error(`unsafe identifier: ${value}`);
            }
            seen.add(value);
        }
    }
    if (!isDeepStrictEqual(proposed, approved))
        throw new Error("allocation differs from trusted record");
    return true;
}

module.exports = { createPlan, validate };
