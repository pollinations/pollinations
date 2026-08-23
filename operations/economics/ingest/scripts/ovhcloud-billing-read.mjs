import { createHash } from "node:crypto";

const REQUIRED_ENV = [
    "OVH_APPLICATION_KEY",
    "OVH_APPLICATION_SECRET",
    "OVH_CONSUMER_KEY",
];

for (const name of REQUIRED_ENV) {
    if (!process.env[name]) {
        throw new Error(`Missing ${name}`);
    }
}

const invoiceIds = process.argv.slice(2);
if (invoiceIds.length === 0) {
    throw new Error("Pass at least one OVH invoice reference");
}

const apiBase = "https://eu.api.ovh.com/1.0";
const applicationKey = process.env.OVH_APPLICATION_KEY;
const applicationSecret = process.env.OVH_APPLICATION_SECRET;
const consumerKey = process.env.OVH_CONSUMER_KEY;

async function request(path) {
    const method = "GET";
    const url = `${apiBase}${path}`;
    const timestampResponse = await fetch(`${apiBase}/auth/time`);
    if (!timestampResponse.ok) {
        throw new Error(`OVH time request failed: ${timestampResponse.status}`);
    }
    const timestamp = await timestampResponse.text();
    // OVH's legacy application-key protocol requires this exact SHA-1 request
    // signature. It authenticates a short-lived HTTPS request and is not used
    // for password storage or content-integrity decisions.
    const signature = `$1$${createHash("sha1")
        .update(
            `${applicationSecret}+${consumerKey}+${method}+${url}++${timestamp}`,
        )
        .digest("hex")}`;

    const response = await fetch(url, {
        headers: {
            "Content-Type": "application/json",
            "X-Ovh-Application": applicationKey,
            "X-Ovh-Consumer": consumerKey,
            "X-Ovh-Signature": signature,
            "X-Ovh-Timestamp": timestamp,
        },
    });
    if (!response.ok) {
        throw new Error(`OVH ${path} failed: ${response.status}`);
    }
    return response.json();
}

function price(value) {
    return {
        value: Number(value?.value ?? 0),
        currency: value?.currencyCode ?? "",
    };
}

const invoices = [];
for (const invoiceId of invoiceIds) {
    const encodedInvoiceId = encodeURIComponent(invoiceId);
    const [bill, detailIds] = await Promise.all([
        request(`/me/bill/${encodedInvoiceId}`),
        request(`/me/bill/${encodedInvoiceId}/details`),
    ]);
    const details = await Promise.all(
        detailIds.map((detailId) =>
            request(
                `/me/bill/${encodedInvoiceId}/details/${encodeURIComponent(detailId)}`,
            ),
        ),
    );

    invoices.push({
        invoice_id: bill.billId,
        issue_date: bill.date,
        order_id: String(bill.orderId),
        total_ex_vat: price(bill.priceWithoutTax),
        details: details.map((detail) => ({
            detail_id: detail.billDetailId,
            description: detail.description,
            domain: detail.domain,
            period_start: detail.periodStart,
            period_end: detail.periodEnd,
            quantity: Number(detail.quantity),
            unit_price: price(detail.unitPrice),
            total_price: price(detail.totalPrice),
        })),
    });
}

process.stdout.write(`${JSON.stringify(invoices, null, 2)}\n`);
