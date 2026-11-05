import type { ArchiveCheck, Data } from "../types";
import { providerAccountBalanceRows } from "./providerBalances";
import {
    canonicalProvider,
    canonicalProviderAccountId,
    PROVIDER_REGISTRY,
    type ProviderDefinition,
} from "./providerRegistry";

// A review of one account never establishes coverage for its siblings.
export function reviewAccountId(
    provider: ProviderDefinition,
    check: ArchiveCheck,
) {
    const canonical = canonicalProviderAccountId(provider, check.account);
    if (provider.accounts?.some((account) => account.id === canonical))
        return canonical;
    const named = provider.accounts?.filter(
        (account) =>
            account.label.toLowerCase() === check.account.trim().toLowerCase(),
    );
    return named?.length === 1 ? named[0].id : canonical;
}

export function vendorDirectoryRows(data: Data, now: Date) {
    const balances = providerAccountBalanceRows(data, now);
    return PROVIDER_REGISTRY.map((provider) => {
        const checks = (data.privateConfig?.reviewNotes.archiveChecks ?? [])
            .filter(
                (check) => canonicalProvider(check.provider) === provider.id,
            )
            .sort((a, b) => Date.parse(b.checkedAt) - Date.parse(a.checkedAt));
        const snapshots = balances.filter((row) => row.vendor === provider.id);
        const accountIds = [
            ...new Set([
                ...(provider.accounts ?? []).map((account) => account.id),
                ...snapshots
                    .filter(
                        (row) => row.balanceAsOf || provider.accounts?.length,
                    )
                    .map((row) => row.accountId),
            ]),
        ];
        return {
            provider,
            checks,
            accounts: accountIds.map((id) => {
                const definition = provider.accounts?.find(
                    (account) => account.id === id,
                );
                const balance = snapshots.find((row) => row.accountId === id);
                return {
                    id,
                    label: definition?.label ?? balance?.accountLabel ?? id,
                    login: definition?.loginEmail ?? balance?.loginEmail,
                    balance,
                    checks: checks.filter(
                        (check) => reviewAccountId(provider, check) === id,
                    ),
                    access:
                        balance?.access ??
                        provider.access?.filter((link) =>
                            link.accountId
                                ? canonicalProviderAccountId(
                                      provider,
                                      link.accountId,
                                  ) === id
                                : accountIds.length === 1,
                        ) ??
                        [],
                };
            }),
            unassignedChecks: checks.filter(
                (check) =>
                    !accountIds.includes(reviewAccountId(provider, check)),
            ),
        };
    }).sort((a, b) => a.provider.label.localeCompare(b.provider.label));
}

export type VendorDirectoryRow = ReturnType<typeof vendorDirectoryRows>[number];
