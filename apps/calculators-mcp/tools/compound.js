import { z } from "zod";

// Compound interest, computed locally — no network or model calls.
// The future value is principal * (1 + r/n)^(n*t) plus the future value of
// an ordinary annuity for the regular contributions, added at the end of
// each compounding period; continuous compounding uses e^(r*t) for the
// principal and monthly contributions growing at the continuous rate.
// Results are rounded to 10 significant digits, the unit_convert /
// loan_payment convention, so exact values stay exact (a $10,000
// interest-free balance with $100 a month for 10 years is exactly $22,000)
// and repeating decimals stay short.
function round10(value) {
    return Number(value.toPrecision(10));
}

const PERIODS_PER_YEAR = {
    annual: 1,
    semiannual: 2,
    quarterly: 4,
    monthly: 12,
    weekly: 52,
    daily: 365,
};

export const compoundTools = [
    [
        "compound_interest",
        "Compute the future value of savings growing at compound interest, computed locally — no network or model calls. Takes the starting principal, the annual interest rate in percent, the term in years and how often interest compounds (annual, semiannual, quarterly, monthly, weekly, daily or continuous). An optional regular contribution is added at the end of each compounding period — monthly when compounding is continuous. Returns the future value, the total amount paid in, the total interest earned and the effective annual rate. Results are rounded to 10 significant digits.",
        {
            principal: z
                .number()
                .finite()
                .min(0)
                .describe(
                    "The starting amount, e.g. 10000. 0 when saving from regular contributions only.",
                ),
            annual_rate: z
                .number()
                .finite()
                .min(0)
                .max(1000)
                .describe(
                    "The annual interest rate in percent, e.g. 5 for 5% a year. 0 for no interest.",
                ),
            years: z
                .number()
                .finite()
                .positive()
                .max(100)
                .describe(
                    "The term in years; fractional years are allowed, e.g. 7.5. The term must be at least one compounding period.",
                ),
            compounding: z
                .enum([
                    "annual",
                    "semiannual",
                    "quarterly",
                    "monthly",
                    "weekly",
                    "daily",
                    "continuous",
                ])
                .default("monthly")
                .describe(
                    "How often interest compounds; monthly by default. With continuous compounding, contributions are monthly.",
                ),
            contribution: z
                .number()
                .finite()
                .min(0)
                .default(0)
                .describe(
                    "Optional regular amount added at the end of each compounding period (monthly when compounding is continuous).",
                ),
        },
        ({ principal, annual_rate, years, compounding, contribution }) => {
            const rate = annual_rate / 100;
            let periods;
            let futurePrincipal;
            let futureContributions;
            let effectiveAnnualRate;
            if (compounding === "continuous") {
                // Continuous compounding has no periods of its own, so
                // contributions are monthly; `periods` counts those months.
                periods = Math.round(years * 12);
                if (periods < 1)
                    throw new Error(
                        `years ${years} is less than one month: the term must be at least one month.`,
                    );
                futurePrincipal = principal * Math.exp(rate * years);
                const monthlyFactor = Math.exp(rate / 12);
                const monthlyRate = monthlyFactor - 1;
                futureContributions =
                    monthlyRate === 0
                        ? contribution * periods
                        : contribution *
                          ((monthlyFactor ** periods - 1) / monthlyRate);
                effectiveAnnualRate = Math.exp(rate) - 1;
            } else {
                const perYear = PERIODS_PER_YEAR[compounding];
                periods = Math.round(years * perYear);
                if (periods < 1)
                    throw new Error(
                        `years ${years} is less than one ${compounding} compounding period: the term must be at least one compounding period.`,
                    );
                const periodicRate = rate / perYear;
                const factor = (1 + periodicRate) ** periods;
                futurePrincipal = principal * factor;
                futureContributions =
                    periodicRate === 0
                        ? contribution * periods
                        : contribution * ((factor - 1) / periodicRate);
                effectiveAnnualRate = (1 + periodicRate) ** perYear - 1;
            }
            const futureValue = futurePrincipal + futureContributions;
            const totalContributions = contribution * periods;
            const totalInvested = principal + totalContributions;
            return {
                principal: round10(principal),
                annual_rate,
                years,
                compounding,
                periods,
                contribution: round10(contribution),
                future_value: round10(futureValue),
                total_contributions: round10(totalContributions),
                total_invested: round10(totalInvested),
                total_interest: round10(futureValue - totalInvested),
                effective_annual_rate: round10(effectiveAnnualRate * 100),
            };
        },
    ],
];
