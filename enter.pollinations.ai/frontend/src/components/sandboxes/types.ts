export type Sandbox = {
    sandboxID: string;
    templateID: string;
    alias?: string;
    startedAt: string;
    endAt: string;
    cpuCount: number;
    memoryMB: number;
    state: "running" | "paused";
};

export type Pricing = {
    maxRunning: number;
    maxRunSeconds: number;
    vcpuSecond: number;
    gibSecond: number;
    templates: { id: string; cpuCount: number; memoryMB: number }[];
};

/** What a sandbox lease costs, in Pollen, at gen's per-second prices. */
export function price(
    pricing: Pricing,
    size: { cpuCount: number; memoryMB: number },
    seconds: number,
): number {
    return (
        seconds *
        (size.cpuCount * pricing.vcpuSecond +
            (size.memoryMB / 1024) * pricing.gibSecond)
    );
}

/** Time a user can pay for at once, up to E2B's 24-hour run. */
export const DURATIONS = [600, 3600, 14_400, 43_200, 86_400];

/** "10 min", "4 h" */
export function seconds(value: number): string {
    return value < 3600 ? `${value / 60} min` : `${value / 3600} h`;
}
