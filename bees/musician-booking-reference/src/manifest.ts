export const musicianBookingAgentManifest = {
    id: "musician-booking-reference",
    name: "Musician Booking Reference",
    description:
        "Reference agent for booking a musician with SQLite-first state and deterministic tools.",
    runtime: { kind: "worker", entrypoint: "src/agent.ts" },
    surfaces: ["openai", "web", "discord", "a2a"],
    tools: [
        "list_packages",
        "collect_event_details",
        "generate_quote",
        "create_update_booking",
        "place_hold",
        "confirm_booking",
        "handoff_needs_review",
        "log_event",
    ],
    tool_servers: [],
    state: {
        scope: "per-user",
        provider: "sqlite",
        retention: { days: 7, payer: "user" },
    },
    billing: {
        default: "user-pays",
        quotas: { daily_pollen: 5 },
    },
    security: { egress_allowlist: [] },
} as const;
