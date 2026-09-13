import type { Conditions } from "./conditions-data";
import type { ConnectState } from "./fixtures";

export type { Conditions } from "./conditions-data";
export type LocalState = ConnectState;

export async function readState(
    changes?: Partial<Conditions>,
): Promise<LocalState> {
    const response = await fetch(
        changes ? "/__connect/conditions" : "/__connect/state",
        changes
            ? {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(changes),
              }
            : undefined,
    );
    if (!response.ok) {
        throw new Error(
            response.status === 409
                ? "Run npm run reset in operations/connect to prepare the local account."
                : "The local Enter and Gen services are unavailable. Start Connect and try again.",
        );
    }
    return response.json();
}
