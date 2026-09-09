export const TOP_UP_AMOUNTS = [10, 20, 50, 100] as const;

export function planKeyTopUp(
    balance: number,
    allowance: number,
    amount: number,
) {
    const nextAllowance = allowance + amount;
    const shortfall = Math.max(0, nextAllowance - balance);
    return {
        nextAllowance,
        shortfall,
        purchaseAmount:
            shortfall === 0
                ? 0
                : (TOP_UP_AMOUNTS.find((pack) => pack >= shortfall) ?? null),
    };
}
