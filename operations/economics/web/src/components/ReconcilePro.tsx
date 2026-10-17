import { createContext, useContext } from "react";
import { fmtExactNumber, fmtExactUsd, fmtNumber, fmtUsd } from "../lib/format";

export const ReconcileProContext = createContext(false);

export function useAmountDisplay() {
    const pro = useContext(ReconcileProContext);
    const usd = pro ? fmtExactUsd : fmtUsd;
    return {
        pro,
        fmtUsd: usd,
        fmtNumber: pro ? fmtExactNumber : fmtNumber,
        fmtSignedUsd: (value: number | null) =>
            value != null && value > 0 ? `+${usd(value)}` : usd(value),
    };
}
