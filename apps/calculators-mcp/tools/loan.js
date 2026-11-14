import { z } from "zod";

// Round to 10 significant digits, the same convention as unit_convert: exact
// values stay exact (a $10,000 interest-free loan over 2 years is exactly
// $416.6666667 a month) and repeating decimals stay short.
function round10(value) {
    return Number(value.toPrecision(10));
}

export const loanTools = [
    [
        "loan_payment",
        "Compute the monthly payment, total interest and total paid for a fixed-rate loan, computed locally — no network or model calls. The monthly payment follows the standard amortization formula; an interest-free loan divides the principal evenly over the term. An optional extra monthly payment shortens the term, and an optional amortization schedule lists every month's payment, principal, interest and remaining balance. Results are rounded to 10 significant digits.",
        {
            principal: z
                .number()
                .finite()
                .positive()
                .describe("The loan amount, e.g. 100000."),
            annual_rate: z
                .number()
                .finite()
                .min(0)
                .max(1000)
                .describe(
                    "The annual interest rate in percent, e.g. 5 for 5% a year. 0 for an interest-free loan.",
                ),
            years: z
                .number()
                .finite()
                .positive()
                .max(100)
                .describe(
                    "The loan term in years; fractional years are allowed, e.g. 7.5 for 90 months. The term must be at least one month.",
                ),
            extra_payment: z
                .number()
                .finite()
                .min(0)
                .default(0)
                .describe(
                    "Optional extra amount paid each month on top of the monthly payment; it shortens the term and lowers the total interest.",
                ),
            include_schedule: z
                .boolean()
                .default(false)
                .describe(
                    "Set true to include the full amortization schedule (one entry per month: payment, principal, interest, balance).",
                ),
        },
        ({
            principal,
            annual_rate,
            years,
            extra_payment,
            include_schedule,
        }) => {
            const months = Math.round(years * 12);
            if (months < 1)
                throw new Error(
                    `years ${years} is less than one month: the term must be at least one month.`,
                );
            const rate = annual_rate / 100 / 12;
            let monthly;
            if (rate === 0) {
                monthly = principal / months;
            } else {
                const factor = (1 + rate) ** months;
                monthly = (principal * rate * factor) / (factor - 1);
            }
            const payment = monthly + extra_payment;

            let balance = principal;
            let totalInterest = 0;
            let totalPaid = 0;
            let payoffMonths = 0;
            const schedule = [];
            for (let month = 1; month <= months; month++) {
                const interest = balance * rate;
                let principalPaid = payment - interest;
                let paid = payment;
                // The last scheduled month pays off whatever is left, so
                // floating-point drift can never leave a residual balance.
                if (month === months || principalPaid >= balance) {
                    principalPaid = balance;
                    paid = balance + interest;
                }
                balance -= principalPaid;
                totalInterest += interest;
                totalPaid += paid;
                payoffMonths = month;
                if (include_schedule)
                    schedule.push({
                        month,
                        payment: round10(paid),
                        principal: round10(principalPaid),
                        interest: round10(interest),
                        balance: round10(Math.max(balance, 0)),
                    });
                if (balance <= 0) break;
            }
            if (balance > 0)
                throw new Error("the loan did not pay off within the term.");

            return {
                principal: round10(principal),
                annual_rate,
                years,
                months,
                monthly_payment: round10(monthly),
                extra_payment: round10(extra_payment),
                payoff_months: payoffMonths,
                total_interest: round10(totalInterest),
                total_paid: round10(totalPaid),
                ...(include_schedule ? { schedule } : {}),
            };
        },
    ],
];
