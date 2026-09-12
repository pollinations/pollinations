export function WalletPaymentStatus({
    payment,
    canceled,
}: {
    payment?: "pending" | "credited";
    canceled?: boolean;
}) {
    if (payment === "pending")
        return (
            <output>
                Payment hasn’t been credited yet. You can check again.
            </output>
        );
    if (payment === "credited")
        return <output>Pollen added to your wallet.</output>;
    return canceled ? <p>Checkout canceled.</p> : null;
}
