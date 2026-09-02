import providerIdentities from "./providers.json";

export const PROVIDER_IDENTITIES = providerIdentities;

export type ProviderId = keyof typeof PROVIDER_IDENTITIES;

export function isProviderId(value: string): value is ProviderId {
    return Object.hasOwn(PROVIDER_IDENTITIES, value);
}
