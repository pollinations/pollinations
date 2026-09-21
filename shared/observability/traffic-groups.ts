export const TRAFFIC_GROUPS = [
    { value: "regular", label: "Regular users" },
    { value: "legacy", label: "Legacy public APIs" },
    { value: "internal", label: "Internal / dev" },
    { value: "all", label: "All traffic" },
] as const;

export type TrafficGroup = (typeof TRAFFIC_GROUPS)[number]["value"];

export function isTrafficGroup(value: string | null): value is TrafficGroup {
    return TRAFFIC_GROUPS.some((group) => group.value === value);
}
