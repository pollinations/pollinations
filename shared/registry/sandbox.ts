// The sandbox templates Pollinations runs, and what they cost. Gen starts and
// bills sandboxes from these tables; /alpha/e2b/pricing and the dashboard
// list them.

export type SandboxProvider = "e2b" | "azure";

// What each provider charges us per running second, in pollen (1 pollen ≈ $1):
// E2B's list prices, and Azure's for a running box, which our Azure credits
// pay. Callers pay `share` of them: a launch promo on both providers, review
// by 2026-12-31.
export const SANDBOX_PROVIDERS: Record<
    SandboxProvider,
    { name: string; vcpuSecond: number; gibSecond: number; share: number }
> = {
    e2b: {
        name: "E2B",
        vcpuSecond: 0.000014,
        gibSecond: 0.0000045,
        share: 0.25,
    },
    azure: {
        name: "Azure",
        vcpuSecond: 0.000024,
        gibSecond: 0.000003,
        share: 0.25,
    },
};

export type SandboxTemplate = {
    id: string;
    name: string;
    provider: SandboxProvider;
    cpuCount: number;
    memoryMB: number;
    diskSizeMB: number;
};

// One image with polli and the coding harnesses in several sizes
// (operations/infrastructure/e2b and azure-sandboxes); gen logs polli in inside
// them. E2B resolves the exact ids to our team's templates, with the sizes they
// were built with. Azure gets the size from gen and picks the disk by it.
export const SANDBOX_TEMPLATES: readonly SandboxTemplate[] = [
    {
        id: "pollinations",
        name: "Pollinations",
        provider: "e2b",
        cpuCount: 2,
        memoryMB: 2048,
        diskSizeMB: 26640,
    },
    {
        id: "pollinations-large",
        name: "Pollinations Large",
        provider: "e2b",
        cpuCount: 4,
        memoryMB: 8192,
        diskSizeMB: 60432,
    },
    {
        id: "pollinations-azure",
        name: "Pollinations",
        provider: "azure",
        cpuCount: 2,
        memoryMB: 2048,
        diskSizeMB: 40960,
    },
    {
        id: "pollinations-azure-large",
        name: "Pollinations Large",
        provider: "azure",
        cpuCount: 4,
        memoryMB: 8192,
        diskSizeMB: 81920,
    },
    {
        id: "pollinations-azure-xl",
        name: "Pollinations XL",
        provider: "azure",
        cpuCount: 8,
        memoryMB: 16384,
        diskSizeMB: 163840,
    },
];

export const sandboxTemplate = (id: string | undefined) =>
    SANDBOX_TEMPLATES.find((template) => template.id === id);

type Rates = { vcpuSecond: number; gibSecond: number };

// The rates a caller pays on this provider.
export function callerRates(provider: SandboxProvider): Rates {
    const { vcpuSecond, gibSecond, share } = SANDBOX_PROVIDERS[provider];
    return { vcpuSecond: vcpuSecond * share, gibSecond: gibSecond * share };
}

export const perSecond = (
    rates: Rates,
    size: { cpuCount: number; memoryMB: number },
) =>
    size.cpuCount * rates.vcpuSecond + (size.memoryMB / 1024) * rates.gibSecond;
