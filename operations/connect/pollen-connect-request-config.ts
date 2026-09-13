import {
    DEFAULT_CONSENT_BUDGET,
    DEFAULT_CONSENT_EXPIRY_DAYS,
} from "@shared/auth/authorize-config.ts";

export const defaultAppPreview: Record<string, string> = {
    protocol: "oauth",
    request_scope: "profile usage keys",
    request_models: "all",
    request_earnings: "1",
    sim_paid: "10",
    sim_quest: "5",
};
export const defaultPreviewRequest = {
    request_scope: defaultAppPreview.request_scope,
    request_models: defaultAppPreview.request_models,
    request_budget: String(DEFAULT_CONSENT_BUDGET),
    request_expiry: String(DEFAULT_CONSENT_EXPIRY_DAYS),
    request_earnings: defaultAppPreview.request_earnings,
    request_attribution: "1",
};
export type AppPreviewProps = {
    appPreview: Record<string, string>;
    onAppPreviewChange: (patch: Record<string, string>) => void;
};
