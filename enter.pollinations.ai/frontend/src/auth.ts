import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { authAdditionalFields } from "@shared/auth/additional-fields.ts";
import { inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { config } from "./config.ts";
import { trackedFetch } from "./lib/outage.ts";

export const authClient = createAuthClient({
    baseURL: config.baseUrl,
    basePath: config.authPath,
    fetchOptions: { customFetchImpl: trackedFetch },
    plugins: [
        oauthProviderClient(),
        inferAdditionalFields(authAdditionalFields),
    ],
});
export type AuthClient = typeof authClient;
export type ClientSession = AuthClient["$Infer"]["Session"];
export type User = ClientSession["user"];
