const TRAFFIC_GROUPS = ["regular", "legacy", "internal", "all"] as const;

export type TrafficGroup = (typeof TRAFFIC_GROUPS)[number];

export function isTrafficGroup(value: string | null): value is TrafficGroup {
    return TRAFFIC_GROUPS.some((group) => group === value);
}
