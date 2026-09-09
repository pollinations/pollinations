import {
    calculateServiceFeeCents,
    createServiceFeeLineItem,
    type PollenPack,
} from "@shared/pollen-packs.ts";
import type Stripe from "stripe";

// Both purchase flows use the same prices, payment methods, tax and invoices.
export function pollenCheckoutParameters(
    pack: PollenPack,
    paymentMethodConfiguration: string,
    metadata: Record<string, string>,
    gift?: { code: string; redeemUrl: string },
) {
    return {
        mode: "payment",
        payment_method_configuration: paymentMethodConfiguration,
        line_items: [
            {
                price_data: {
                    currency: "usd",
                    unit_amount: pack.amountUsd * 100,
                    tax_behavior: "exclusive",
                    product_data: {
                        name: gift
                            ? `🎁 ${pack.amountUsd} Pollen gift`
                            : pack.checkoutName,
                        description: gift
                            ? `Redeem at ${gift.redeemUrl}`
                            : pack.checkoutDescription,
                        images: [pack.checkoutImageUrl],
                        tax_code: pack.taxCode,
                    },
                },
                quantity: 1,
            },
            createServiceFeeLineItem(
                calculateServiceFeeCents(pack.amountUsd * 100),
            ),
        ],
        adaptive_pricing: { enabled: true },
        automatic_tax: { enabled: true },
        tax_id_collection: { enabled: true },
        payment_intent_data: { metadata },
        metadata: { ...metadata, ...(gift ? { giftCode: gift.code } : {}) },
        invoice_creation: {
            enabled: true,
            invoice_data: {
                rendering_options: { amount_tax_display: "exclude_tax" },
                ...(gift
                    ? {
                          description: `${pack.amountUsd} Pollen gift code`,
                          custom_fields: [
                              { name: "Gift code", value: gift.code },
                          ],
                          footer: `Redeem at ${gift.redeemUrl}`,
                      }
                    : {}),
            },
        },
    } satisfies Stripe.Checkout.SessionCreateParams;
}
