import { useEffect, useState } from "react";
import { apiClient } from "../api.ts";

export type AccountBalance = {
    tierBalance: number;
    packBalance: number;
};

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
        setBalance(undefined);
        apiClient.customer.balance
            .$get()
            .then((response) => {
                if (!response.ok) throw new Error("Failed to load wallet");
                return response.json();
            })
            .then((data) => {
                if (!canceled) setBalance(data);
            })
            .catch(() => {
                if (!canceled) setBalance(undefined);
            });
        return () => {
            canceled = true;
        };
    }, [enabled]);

    return balance;
}
