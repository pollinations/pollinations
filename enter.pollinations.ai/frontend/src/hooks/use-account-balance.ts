import { useEffect, useState } from "react";
import { accountClient } from "../api.ts";

export type AccountBalance = {
    tierBalance: number;
    packBalance: number;
    questPollenRestricted: boolean;
};

/** The balance request's path, for outage checks. */
export const BALANCE_PATH = "/account/balance";

export async function fetchAccountBalance(): Promise<AccountBalance> {
    const response = await accountClient.balance.$get();
    if (!response.ok) throw new Error("Failed to load wallet");
    const data = await response.json();
    if (!("accountBalance" in data)) throw new Error("Failed to load wallet");
    return {
        tierBalance:
            data.accountBalance.tier + (data.accountBalance.heldTier ?? 0),
        packBalance: data.accountBalance.paid,
        questPollenRestricted:
            data.accountBalance.questPollenRestricted ?? false,
    };
}

export function useAccountBalance(
    enabled: boolean,
): AccountBalance | undefined {
    const [balance, setBalance] = useState<AccountBalance>();

    useEffect(() => {
        if (!enabled) {
            setBalance(undefined);
            return;
        }
        let canceled = false;
        const load = () =>
            fetchAccountBalance()
                .then((data) => {
                    if (!canceled) setBalance(data);
                })
                .catch(() => {
                    if (!canceled) setBalance(undefined);
                });
        const onVisible = () => {
            if (document.visibilityState === "visible") void load();
        };

        setBalance(undefined);
        void load();
        document.addEventListener("visibilitychange", onVisible);
        return () => {
            canceled = true;
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, [enabled]);

    return balance;
}
