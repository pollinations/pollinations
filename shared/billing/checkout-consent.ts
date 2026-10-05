import { PUBLIC_URLS } from "../public-urls.ts";

export const CHECKOUT_CONSENT_VERSION = "2026-10-01";
const WITHDRAWAL_NOTICE =
    "If I withdraw within 14 days, I pay for usage supplied; my withdrawal right ends once the service is fully performed.";
export const IMMEDIATE_SERVICE_REQUEST = `I request immediate API service. ${WITHDRAWAL_NOTICE}`;
export const CHECKOUT_CONSENT_TEXT = `I agree to the [Terms](${PUBLIC_URLS.root}/terms) and [Refund Policy](${PUBLIC_URLS.root}/refunds). ${IMMEDIATE_SERVICE_REQUEST}`;
// Describes the terms without asserting that merely creating a session is consent.
export const CHECKOUT_INVOICE_FOOTER = `EEA consumer withdrawal: 14 days from purchase. Where immediate service was requested, usage supplied before withdrawal remains payable; the withdrawal right ends once the service is fully performed. Statutory rights are unaffected. ${PUBLIC_URLS.root}/refunds`;
