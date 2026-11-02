import { createContext, useContext } from "react";
import {
    fmtExactNumber,
    fmtExactUsd,
    fmtMarginPct,
    fmtNumber,
    fmtPct,
    fmtRateUsd,
    fmtUnsignedPct,
    fmtUsd,
} from "../lib/format";

export const ReconcileProContext = createContext(false);

export function useAmountDisplay() {
    const pro = useContext(ReconcileProContext);
    const usd = pro ? fmtExactUsd : fmtUsd;
    return {
        pro,
        fmtUsd: usd,
        fmtRateUsd,
        fmtPct: (value: number | null) => fmtPct(value, pro ? 2 : 0),
        fmtMarginPct: (value: number | null) =>
            fmtMarginPct(value, pro ? 2 : 0),
        fmtUnsignedPct: (value: number | null | undefined) =>
            fmtUnsignedPct(value, pro ? 2 : 0),
        fmtNumber: pro ? fmtExactNumber : fmtNumber,
        fmtSignedUsd: (value: number | null) => {
            const formatted = usd(value);
            return formatted && value != null && value > 0
                ? `+${formatted}`
                : formatted;
        },
    };
}
