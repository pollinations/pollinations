import { config } from "./config.ts";
import { apiKeyClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { createAuth } from "@/auth.ts";
import { inferAdditionalFields } from "better-auth/client/plugins";
import { redirect } from "@tanstack/react-router";

export const authClient = createAuthClient({
    baseURL: config.baseUrl,
    basePath: config.authPath,
    plugins: [
        apiKeyClient(),
        inferAdditionalFields<ReturnType<typeof createAuth>>(),
    ],
});
export type AuthClient = typeof authClient;
export type ClientSession = AuthClient["$Infer"]["Session"];
export type Session = ClientSession["session"];
export type User = ClientSession["user"];

export async function getUserOrRedirect() {
    const result = await authClient.getSession();
    if (result.error) throw new Error("Autentication failed.");
    else if (!result.data?.user) throw redirect({ to: "/sign-in" });
    else return { user: result.data.user };
}
