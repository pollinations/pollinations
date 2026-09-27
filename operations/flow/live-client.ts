import type { FlowState } from "./fixtures";
import { ADMIN_ORIGIN } from "./local-origins";

export type { Conditions } from "./conditions-data";
export type LocalState = FlowState;

export async function postReviewRequest(path: string, body?: unknown) {
    const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        ...(body !== undefined && { body: JSON.stringify(body) }),
    });
    if (response.headers.get("X-Flow-Clear-Admin-Session") === "true") {
        const logout = await fetch(`${ADMIN_ORIGIN}/__flow/admin-session`, {
            method: "POST",
            credentials: "include",
        });
        if (!logout.ok) {
            await response.body?.cancel();
            throw new Error(
                "Couldn’t clear the Admin example session. Please try again.",
            );
        }
    }
    return response;
}

export class ReviewNotPreparedError extends Error {
    constructor() {
        super("Prepare a review in Flow before opening this page.");
    }
}

export async function readState(): Promise<LocalState> {
    const response = await fetch("/__flow/state");
    if (response.status === 409) throw new ReviewNotPreparedError();
    if (!response.ok) {
        throw new Error(
            "The review services are unavailable. Please try again.",
        );
    }
    return response.json();
}
