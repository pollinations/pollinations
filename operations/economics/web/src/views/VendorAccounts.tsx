import { EvidenceAction } from "../components/Evidence";
import { useAmountDisplay } from "../components/ReconcilePro";
import { fmtPeriod } from "../lib/format";
import type { VendorDirectoryRow } from "../lib/vendorDirectory";
import type { ArchiveCheck } from "../types";

const CHECK_STATUS = {
    found: "Evidence found",
    partial: "Partial evidence",
    not_found: "Evidence not found",
    blocked: "Check blocked",
};

function EvidenceCheck({ check }: { check: ArchiveCheck }) {
    return (
        <div className="space-y-2">
            <p className="text-xs text-theme-text-soft">
                Evidence checked {fmtPeriod(check.checkedAt.slice(0, 10))} · for{" "}
                {fmtPeriod(check.month)}
            </p>
            <p
                className={
                    check.status === "found"
                        ? "text-intent-success-text"
                        : "text-intent-warning-text"
                }
            >
                {CHECK_STATUS[check.status]}
            </p>
            <p>{check.note}</p>
            <div className="flex flex-wrap gap-2">
                {check.evidence.map((evidence) => (
                    <EvidenceAction key={evidence} evidence={evidence} />
                ))}
            </div>
        </div>
    );
}

function AccountCard({
    account,
    journalAvailable,
}: {
    account: VendorDirectoryRow["accounts"][number];
    journalAvailable: boolean;
}) {
    const { fmtUsd } = useAmountDisplay();
    const { balance, checks } = account;
    return (
        <article className="rounded-xl border border-theme-text-soft/20 bg-surface-block p-4 text-sm space-y-4">
            <header>
                <h3 className="font-semibold">{account.label}</h3>
                {account.login && (
                    <p className="text-theme-text-soft">{account.login}</p>
                )}
                <p className="text-xs text-theme-text-soft break-all">
                    Account {account.id}
                    {balance && !balance.active ? " · Archived" : ""}
                </p>
                <div className="mt-2 flex flex-wrap gap-3">
                    {account.access.map((link) => (
                        <a
                            key={`${link.url}:${link.accountId}`}
                            className="underline"
                            href={link.url}
                            target="_blank"
                            rel="noreferrer"
                        >
                            {link.label ?? "Provider dashboard"} ↗
                        </a>
                    ))}
                </div>
            </header>
            {balance?.balanceAsOf ? (
                <div className="border-t border-theme-text-soft/20 pt-3">
                    <p className="text-xs text-theme-text-soft">
                        Balance snapshot · {fmtPeriod(balance.balanceAsOf)}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-6">
                        <div>
                            <span className="text-theme-text-soft">Cash </span>
                            <strong>{fmtUsd(balance.cashBalanceUsd)}</strong>
                        </div>
                        <div>
                            <span className="text-theme-text-soft">
                                Credit{" "}
                            </span>
                            <strong>{fmtUsd(balance.creditBalanceUsd)}</strong>
                        </div>
                    </div>
                    {balance.balanceStatus === "stale" && (
                        <p className="mt-2 text-intent-warning-text">
                            Snapshot needs refreshing
                        </p>
                    )}
                    {balance.creditExpiry && (
                        <p className="mt-2 text-theme-text-soft">
                            Credit expiry · {fmtPeriod(balance.creditExpiry)}
                        </p>
                    )}
                    {balance.balanceNote && (
                        <p className="mt-2 text-theme-text-soft">
                            {balance.balanceNote}
                        </p>
                    )}
                </div>
            ) : balance?.balanceTracking && balance.active ? (
                <p className="text-intent-warning-text">
                    No balance snapshot recorded
                </p>
            ) : null}
            <div className="border-t border-theme-text-soft/20 pt-3">
                {checks[0] ? (
                    <EvidenceCheck check={checks[0]} />
                ) : (
                    <p className="text-theme-text-soft">
                        {journalAvailable
                            ? "No evidence check recorded in the journal."
                            : "Journal unavailable; review history unknown."}
                    </p>
                )}
                {checks.length > 1 && (
                    <details className="mt-3">
                        <summary className="cursor-pointer text-theme-text-soft">
                            Earlier checks · {checks.length - 1}
                        </summary>
                        <div className="mt-3 space-y-4">
                            {checks.slice(1).map((check, index) => (
                                <EvidenceCheck
                                    key={`${check.checkedAt}:${check.month}:${index}`}
                                    check={check}
                                />
                            ))}
                        </div>
                    </details>
                )}
            </div>
        </article>
    );
}

export function VendorAccounts({
    row,
    journalAvailable,
}: {
    row: VendorDirectoryRow;
    journalAvailable: boolean;
}) {
    const { provider, accounts, unassignedChecks } = row;
    const sharedAccess = (provider.access ?? []).filter(
        (link) => !accounts.some((account) => account.access.includes(link)),
    );
    return (
        <div className="space-y-4">
            {" "}
            {accounts.length > 0 && (
                <div className="grid gap-4 lg:grid-cols-2">
                    {accounts.map((account) => (
                        <AccountCard
                            key={account.id}
                            account={account}
                            journalAvailable={journalAvailable}
                        />
                    ))}
                </div>
            )}
            {sharedAccess.length > 0 ? (
                <div className="flex gap-3">
                    {sharedAccess.map((link) => (
                        <a
                            key={link.url}
                            className="underline"
                            href={link.url}
                            target="_blank"
                            rel="noreferrer"
                        >
                            {link.label ?? "Provider dashboard"} ↗
                        </a>
                    ))}
                </div>
            ) : null}
            {unassignedChecks.length > 0 && (
                <details>
                    <summary className="cursor-pointer text-theme-text-soft">
                        Other recorded checks · {unassignedChecks.length}
                    </summary>
                    <div className="mt-3 space-y-3">
                        {unassignedChecks.map((check, index) => (
                            <div
                                key={`${check.account}:${check.checkedAt}:${index}`}
                            >
                                <p className="font-semibold">{check.account}</p>
                                <EvidenceCheck check={check} />
                            </div>
                        ))}
                    </div>
                </details>
            )}
        </div>
    );
}
