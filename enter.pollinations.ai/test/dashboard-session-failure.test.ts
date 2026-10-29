import { expect, it } from "vitest";
import {
    DASHBOARD_AUTH_FAILED_MESSAGE,
    DASHBOARD_SERVICE_UNAVAILABLE_MESSAGE,
    dashboardSessionFailureMessage,
} from "../frontend/src/components/layout/dashboard-session-failure.ts";

it("treats a 5xx or a failed lookup as a backend outage, not a sign-out", () => {
    expect(dashboardSessionFailureMessage(null)).toBe(
        DASHBOARD_SERVICE_UNAVAILABLE_MESSAGE,
    );
    expect(dashboardSessionFailureMessage(undefined)).toBe(
        DASHBOARD_SERVICE_UNAVAILABLE_MESSAGE,
    );
    expect(dashboardSessionFailureMessage({})).toBe(
        DASHBOARD_SERVICE_UNAVAILABLE_MESSAGE,
    );
    expect(dashboardSessionFailureMessage({ status: 503 })).toBe(
        DASHBOARD_SERVICE_UNAVAILABLE_MESSAGE,
    );
});

it("only an actual rejection is an authentication failure", () => {
    expect(dashboardSessionFailureMessage({ status: 401 })).toBe(
        DASHBOARD_AUTH_FAILED_MESSAGE,
    );
    expect(dashboardSessionFailureMessage({ status: 403 })).toBe(
        DASHBOARD_AUTH_FAILED_MESSAGE,
    );
});
