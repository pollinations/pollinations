export const entrances = [
    { id: "app", label: "Apps", node: "app-connect" },
    { id: "device", label: "Devices", node: "device-start" },
    { id: "account", label: "Dashboard", node: "enter-signed-out" },
    { id: "admin", label: "Admin", node: "dashboard-sign-in" },
] as const;
export type JourneyEntrance = (typeof entrances)[number]["id"];
export type JourneyWorld = JourneyEntrance | "topup";
export type JourneySection =
    | "main"
    | "topup"
    | "link"
    | "keys"
    | "apps"
    | "models"
    | "agents"
    | "news"
    | "catalog"
    | "activity"
    | "quests"
    | "account";
export type JourneySelection = {
    world: JourneyEntrance;
    section: JourneySection;
    revision: number;
};
export type JourneyLocation = { world: JourneyWorld; node: string };
