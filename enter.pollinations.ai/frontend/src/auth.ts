import { authAdditionalFields } from "@shared/auth/additional-fields.ts";
import { redirect } from "@tanstack/react-router";
import {
    apiKeyClient,
    inferAdditionalFields,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { config } from "./config.ts";

export const authClient = createAuthClient({
    baseURL: config.baseUrl,
    basePath: config.authPath,
    plugins: [apiKeyClient(), inferAdditionalFields(authAdditionalFields)],
});
export type AuthClient = typeof authClient;
export type ClientSession = AuthClient["$Infer"]["Session"];
export type Session = ClientSession["session"];
export type User = ClientSession["user"];

export async function getUserOrRedirect() {
    const result = await authClient.getSession();
    if (result.error) throw new Error("Authentication failed.");
    else if (!result.data?.user)
        throw redirect({
            to: "/sign-in",
            hash: window.location.hash || undefined,
        });
    else return { user: result.data.user };
}
