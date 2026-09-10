import { PollenFundingAction } from "./PollenFundingAction.tsx";

/** The app supplies confirmed wallet data; mixed models need no paid warning. */
export function PollenModelNotice({
    requirement,
    paidBalance,
    enterUrl,
}: {
    requirement: "all" | "some" | null;
    paidBalance: number | null | undefined;
    enterUrl: string;
}) {
    if (
        requirement !== "all" ||
        paidBalance == null ||
        !Number.isFinite(paidBalance) ||
        paidBalance > 0
    )
        return null;
    return (
        <PollenFundingAction
            status={{ state: "paid-required" }}
            enterUrl={enterUrl}
        />
    );
}
