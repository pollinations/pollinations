import { registrableDomain } from "./signup-domains.ts";

/** Domain detection is only an input at signup; the user field controls spending. */
export async function restrictQuestPollenAtSignup(
    kv: KVNamespace,
    email: string,
): Promise<boolean | null> {
    const domain = registrableDomain(email);
    if (!domain) return null;
    const [hold, release] = await Promise.all([
        kv.get(`hold:${domain}`),
        kv.get(`release:${domain}`),
    ]);
    return hold !== null && release === null ? true : null;
}
