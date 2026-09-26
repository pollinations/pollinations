import type { FlowState } from "./fixtures";

export type { Conditions } from "./conditions-data";
export type LocalState = FlowState;

export async function readState(): Promise<LocalState> {
    const response = await fetch("/__flow/state");
    if (!response.ok) {
        throw new Error(
            response.status === 409
                ? "Run npm run reset in operations/flow to prepare the local account."
                : "The local Enter and Gen services are unavailable. Start Flow and try again.",
        );
    }
    return response.json();
}
