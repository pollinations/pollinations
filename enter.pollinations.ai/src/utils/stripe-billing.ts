import { user as userTable } from "@shared/db/better-auth.ts";
import { and, eq, isNull } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { drizzle } from "drizzle-orm/d1";
import type Stripe from "stripe";
import { createStripeClient } from "./stripe.ts";

const CUSTOMER_CREATE_IDEMPOTENCY_VERSION = "v1";
const METADATA_USER_ID = "pollinations_user_id";
const METADATA_ACCOUNT_TYPE = "pollinations_account_type";

const INVOICE_PAGE_SIZE = 8;

export type BillingAccountType = "individual" | "company";

export type BillingAddress = {
    line1: string;
    line2: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
};

export type BillingProfileInput = {
    accountType: BillingAccountType;
    name: string;
    businessName?: string;
    address: BillingAddress;
    taxId?: {
        value?: string;
    };
};

type UserBillingRow = {
    id: string;
    name: string;
    email: string;
    stripeCustomerId: string | null;
};

const ISO_COUNTRY_CODES = [
    "AD",
    "AE",
    "AF",
    "AG",
    "AI",
    "AL",
    "AM",
    "AO",
    "AQ",
    "AR",
    "AS",
    "AT",
    "AU",
    "AW",
    "AX",
    "AZ",
    "BA",
    "BB",
    "BD",
    "BE",
    "BF",
    "BG",
    "BH",
    "BI",
    "BJ",
    "BL",
    "BM",
    "BN",
    "BO",
    "BQ",
    "BR",
    "BS",
    "BT",
    "BV",
    "BW",
    "BY",
    "BZ",
    "CA",
    "CC",
    "CD",
    "CF",
    "CG",
    "CH",
    "CI",
    "CK",
    "CL",
    "CM",
    "CN",
    "CO",
    "CR",
    "CU",
    "CV",
    "CW",
    "CX",
    "CY",
    "CZ",
    "DE",
    "DJ",
    "DK",
    "DM",
    "DO",
    "DZ",
    "EC",
    "EE",
    "EG",
    "EH",
    "ER",
    "ES",
    "ET",
    "FI",
    "FJ",
    "FK",
    "FM",
    "FO",
    "FR",
    "GA",
    "GB",
    "GD",
    "GE",
    "GF",
    "GG",
    "GH",
    "GI",
    "GL",
    "GM",
    "GN",
    "GP",
    "GQ",
    "GR",
    "GS",
    "GT",
    "GU",
    "GW",
    "GY",
    "HK",
    "HM",
    "HN",
    "HR",
    "HT",
    "HU",
    "ID",
    "IE",
    "IL",
    "IM",
    "IN",
    "IO",
    "IQ",
    "IR",
    "IS",
    "IT",
    "JE",
    "JM",
    "JO",
    "JP",
    "KE",
    "KG",
    "KH",
    "KI",
    "KM",
    "KN",
    "KP",
    "KR",
    "KW",
    "KY",
    "KZ",
    "LA",
    "LB",
    "LC",
    "LI",
    "LK",
    "LR",
    "LS",
    "LT",
    "LU",
    "LV",
    "LY",
    "MA",
    "MC",
    "MD",
    "ME",
    "MF",
    "MG",
    "MH",
    "MK",
    "ML",
    "MM",
    "MN",
    "MO",
    "MP",
    "MQ",
    "MR",
    "MS",
    "MT",
    "MU",
    "MV",
    "MW",
    "MX",
    "MY",
    "MZ",
    "NA",
    "NC",
    "NE",
    "NF",
    "NG",
    "NI",
    "NL",
    "NO",
    "NP",
    "NR",
    "NU",
    "NZ",
    "OM",
    "PA",
    "PE",
    "PF",
    "PG",
    "PH",
    "PK",
    "PL",
    "PM",
    "PN",
    "PR",
    "PS",
    "PT",
    "PW",
    "PY",
    "QA",
    "RE",
    "RO",
    "RS",
    "RU",
    "RW",
    "SA",
    "SB",
    "SC",
    "SD",
    "SE",
    "SG",
    "SH",
    "SI",
    "SJ",
    "SK",
    "SL",
    "SM",
    "SN",
    "SO",
    "SR",
    "SS",
    "ST",
    "SV",
    "SX",
    "SY",
    "SZ",
    "TC",
    "TD",
    "TF",
    "TG",
    "TH",
    "TJ",
    "TK",
    "TL",
    "TM",
    "TN",
    "TO",
    "TR",
    "TT",
    "TV",
    "TW",
    "TZ",
    "UA",
    "UG",
    "UM",
    "US",
    "UY",
    "UZ",
    "VA",
    "VC",
    "VE",
    "VG",
    "VI",
    "VN",
    "VU",
    "WF",
    "WS",
    "YE",
    "YT",
    "ZA",
    "ZM",
    "ZW",
] as const;

const ISO_COUNTRY_CODE_SET = new Set<string>(ISO_COUNTRY_CODES);

const EU_VAT_COUNTRIES = new Set([
    "AT",
    "BE",
    "BG",
    "CY",
    "CZ",
    "DE",
    "DK",
    "EE",
    "ES",
    "FI",
    "FR",
    "GR",
    "HR",
    "HU",
    "IE",
    "IT",
    "LT",
    "LU",
    "LV",
    "MT",
    "NL",
    "PL",
    "PT",
    "RO",
    "SE",
    "SI",
    "SK",
]);

const TAX_ID_TYPE_BY_COUNTRY: Record<
    string,
    Stripe.CustomerCreateTaxIdParams.Type
> = {
    AD: "ad_nrt",
    AE: "ae_trn",
    AL: "al_tin",
    AM: "am_tin",
    AO: "ao_tin",
    AR: "ar_cuit",
    AU: "au_abn",
    AW: "aw_tin",
    AZ: "az_tin",
    BA: "ba_tin",
    BB: "bb_tin",
    BD: "bd_bin",
    BF: "bf_ifu",
    BH: "bh_vat",
    BJ: "bj_ifu",
    BO: "bo_tin",
    BR: "br_cnpj",
    BS: "bs_tin",
    BY: "by_tin",
    CA: "ca_gst_hst",
    CD: "cd_nif",
    CH: "ch_vat",
    CL: "cl_tin",
    CM: "cm_niu",
    CN: "cn_tin",
    CO: "co_nit",
    CR: "cr_tin",
    CV: "cv_nif",
    DO: "do_rcn",
    EC: "ec_ruc",
    EG: "eg_tin",
    ET: "et_tin",
    GB: "gb_vat",
    GE: "ge_vat",
    GN: "gn_nif",
    HK: "hk_br",
    ID: "id_npwp",
    IL: "il_vat",
    IN: "in_gst",
    IS: "is_vat",
    JP: "jp_cn",
    KE: "ke_pin",
    KG: "kg_tin",
    KH: "kh_tin",
    KR: "kr_brn",
    KZ: "kz_bin",
    LA: "la_tin",
    LI: "li_vat",
    MA: "ma_vat",
    MD: "md_vat",
    ME: "me_pib",
    MK: "mk_vat",
    MR: "mr_nif",
    MX: "mx_rfc",
    MY: "my_itn",
    NG: "ng_tin",
    NO: "no_vat",
    NP: "np_pan",
    NZ: "nz_gst",
    OM: "om_vat",
    PE: "pe_ruc",
    PH: "ph_tin",
    RS: "rs_pib",
    RU: "ru_inn",
    SA: "sa_vat",
    SG: "sg_gst",
    SN: "sn_ninea",
    SR: "sr_fin",
    SV: "sv_nit",
    TH: "th_vat",
    TJ: "tj_tin",
    TR: "tr_tin",
    TW: "tw_vat",
    TZ: "tz_vat",
    UA: "ua_vat",
    UG: "ug_tin",
    US: "us_ein",
    UY: "uy_ruc",
    UZ: "uz_vat",
    VE: "ve_rif",
    VN: "vn_tin",
    ZA: "za_vat",
    ZM: "zm_tin",
    ZW: "zw_tin",
};

const countryDisplayNames =
    typeof Intl.DisplayNames === "function"
        ? new Intl.DisplayNames(["en"], { type: "region" })
        : null;

export const COUNTRY_OPTIONS = ISO_COUNTRY_CODES.map((code) => {
    const taxIdType = getTaxIdTypeForCountry(code);
    return {
        code,
        name: countryDisplayNames?.of(code) ?? code,
        taxIdType,
        taxIdLabel: getTaxIdLabelForType(taxIdType),
    };
}).sort((a, b) => a.name.localeCompare(b.name));

export function getTaxIdTypeForCountry(
    country: string,
): Stripe.CustomerCreateTaxIdParams.Type | null {
    const normalized = country.trim().toUpperCase();
    if (EU_VAT_COUNTRIES.has(normalized)) return "eu_vat";
    return TAX_ID_TYPE_BY_COUNTRY[normalized] ?? null;
}

export function getTaxIdLabel(country: string): string {
    return getTaxIdLabelForType(getTaxIdTypeForCountry(country));
}

function getTaxIdLabelForType(type: string | null): string {
    if (!type) return "Tax ID";
    if (type === "eu_vat" || type.endsWith("_vat")) return "VAT number";
    if (type === "us_ein") return "EIN";
    if (type.endsWith("_gst") || type === "ca_gst_hst") return "GST number";
    if (type === "au_abn") return "ABN";
    if (type === "hk_br" || type === "kr_brn") {
        return "Business registration number";
    }
    return "Tax ID";
}

export function getBillingReturnUrl(env: CloudflareBindings): string {
    const baseUrl = env.STRIPE_SUCCESS_URL || "https://enter.pollinations.ai";
    return `${baseUrl}?tab=billing`;
}

export async function getOrCreateStripeCustomerId(
    env: CloudflareBindings,
    userId: string,
): Promise<string> {
    const db = drizzle(env.DB);
    const user = await getUserBillingRow(db, userId);

    if (user.stripeCustomerId) {
        return user.stripeCustomerId;
    }

    const stripe = createStripeClient(env);
    const customer = await stripe.customers.create(
        {
            email: user.email,
            name: user.name,
            metadata: {
                [METADATA_USER_ID]: user.id,
                [METADATA_ACCOUNT_TYPE]: "individual",
            },
        },
        {
            idempotencyKey: `pollinations:${user.id}:stripe-customer:${CUSTOMER_CREATE_IDEMPOTENCY_VERSION}`,
        },
    );

    await db
        .update(userTable)
        .set({ stripeCustomerId: customer.id })
        .where(
            and(eq(userTable.id, user.id), isNull(userTable.stripeCustomerId)),
        );

    const updated = await getUserBillingRow(db, userId);
    return updated.stripeCustomerId ?? customer.id;
}

export async function getBillingState(
    env: CloudflareBindings,
    userId: string,
    invoiceCursor?: string | null,
) {
    const stripe = createStripeClient(env);
    const stripeCustomerId = await getOrCreateStripeCustomerId(env, userId);

    const [customer, paymentMethods, taxIds, invoicePage] = await Promise.all([
        retrieveActiveCustomer(stripe, stripeCustomerId),
        stripe.customers.listPaymentMethods(stripeCustomerId, {
            type: "card",
            limit: 100,
        }),
        stripe.customers.listTaxIds(stripeCustomerId, { limit: 100 }),
        listInvoicesForCustomer(stripe, stripeCustomerId, invoiceCursor),
    ]);

    const cardPaymentMethods = paymentMethods.data.filter(
        (method) => method.type === "card" && method.card,
    );
    let defaultPaymentMethodId = getStripeId(
        customer.invoice_settings?.default_payment_method,
    );

    if (!defaultPaymentMethodId && cardPaymentMethods.length === 1) {
        defaultPaymentMethodId = cardPaymentMethods[0].id;
        await stripe.customers.update(stripeCustomerId, {
            invoice_settings: {
                default_payment_method: defaultPaymentMethodId,
            },
        });
    }

    return {
        profile: toBillingProfile(customer, taxIds.data[0] ?? null),
        cards: cardPaymentMethods.map((method) => ({
            id: method.id,
            brand: method.card?.brand ?? "card",
            last4: method.card?.last4 ?? "",
            expMonth: method.card?.exp_month ?? null,
            expYear: method.card?.exp_year ?? null,
            isDefault: method.id === defaultPaymentMethodId,
        })),
        invoices: invoicePage.invoices,
        invoiceCursor: invoicePage.nextCursor,
        hasMoreInvoices: invoicePage.hasMore,
    };
}

export async function updateBillingProfile(
    env: CloudflareBindings,
    userId: string,
    input: BillingProfileInput,
) {
    const db = drizzle(env.DB);
    const stripe = createStripeClient(env);
    const stripeCustomerId = await getOrCreateStripeCustomerId(env, userId);
    const user = await getUserBillingRow(db, userId);
    const accountType =
        input.accountType === "company" ? "company" : "individual";
    const address = normalizeAddress(input.address);
    const name = input.name.trim();
    const businessName = input.businessName?.trim() ?? "";
    const fieldErrors = validateBillingProfile({
        accountType,
        name,
        businessName,
        address,
        taxId: input.taxId,
    });

    if (Object.keys(fieldErrors).length > 0) {
        return { ok: false as const, status: 400, fieldErrors };
    }

    const taxIdValue = input.taxId?.value?.trim() ?? "";
    const taxIdType =
        accountType === "company"
            ? getTaxIdTypeForCountry(address.country)
            : null;

    if (accountType === "company" && taxIdValue && !taxIdType) {
        return {
            ok: false as const,
            status: 400,
            fieldErrors: {
                taxId: "Tax IDs are not supported for this country yet.",
            },
        };
    }

    const customer = await stripe.customers.update(stripeCustomerId, {
        email: user.email,
        name: accountType === "company" ? businessName : name,
        individual_name: name,
        business_name: accountType === "company" ? businessName : "",
        address: toStripeAddress(address),
        metadata: {
            [METADATA_USER_ID]: user.id,
            [METADATA_ACCOUNT_TYPE]: accountType,
        },
        tax: { validate_location: "immediately" },
    });

    const existingTaxIds = await stripe.customers.listTaxIds(stripeCustomerId, {
        limit: 100,
    });

    const currentTaxId = existingTaxIds.data[0] ?? null;
    const shouldReplaceTaxId =
        accountType !== "company" ||
        !taxIdValue ||
        !currentTaxId ||
        currentTaxId.value !== taxIdValue ||
        currentTaxId.type !== taxIdType;

    if (shouldReplaceTaxId) {
        let createdTaxId: Stripe.TaxId | null = null;

        if (accountType === "company" && taxIdValue && taxIdType) {
            createdTaxId = await stripe.customers.createTaxId(
                stripeCustomerId,
                {
                    type: taxIdType,
                    value: taxIdValue,
                },
            );
        }

        for (const taxId of existingTaxIds.data) {
            if (taxId.id !== createdTaxId?.id) {
                await stripe.customers.deleteTaxId(stripeCustomerId, taxId.id);
            }
        }
    }

    const updatedTaxIds = await stripe.customers.listTaxIds(stripeCustomerId, {
        limit: 100,
    });

    return {
        ok: true as const,
        profile: toBillingProfile(customer, updatedTaxIds.data[0] ?? null),
    };
}

export async function createPaymentMethodSetupSession(
    env: CloudflareBindings,
    userId: string,
) {
    const stripe = createStripeClient(env);
    const customer = await getOrCreateStripeCustomerId(env, userId);
    return stripe.checkout.sessions.create({
        mode: "setup",
        customer,
        payment_method_types: ["card"],
        setup_intent_data: {
            metadata: { [METADATA_USER_ID]: userId },
        },
        metadata: {
            [METADATA_USER_ID]: userId,
            purpose: "payment_method_setup",
        },
        success_url: `${getBillingReturnUrl(env)}&stripe_setup_success=true&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${getBillingReturnUrl(env)}&stripe_setup_canceled=true`,
    });
}

export async function detachUserPaymentMethod(
    env: CloudflareBindings,
    userId: string,
    paymentMethodId: string,
): Promise<"detached" | "forbidden"> {
    const stripe = createStripeClient(env);
    const customerId = await getOrCreateStripeCustomerId(env, userId);
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);

    if (getStripeId(paymentMethod.customer) !== customerId) {
        return "forbidden";
    }

    await stripe.paymentMethods.detach(paymentMethodId);
    return "detached";
}

export async function setDefaultUserPaymentMethod(
    env: CloudflareBindings,
    userId: string,
    paymentMethodId: string,
): Promise<"updated" | "forbidden"> {
    const stripe = createStripeClient(env);
    const customerId = await getOrCreateStripeCustomerId(env, userId);
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);

    if (getStripeId(paymentMethod.customer) !== customerId) {
        return "forbidden";
    }

    await stripe.customers.update(customerId, {
        invoice_settings: { default_payment_method: paymentMethodId },
    });
    return "updated";
}

export async function setSetupSessionPaymentMethodAsDefault(
    stripe: Stripe,
    session: Stripe.Checkout.Session,
): Promise<void> {
    const customerId = getStripeId(session.customer);
    const setupIntentId = getStripeId(session.setup_intent);
    if (!customerId || !setupIntentId) return;

    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted) return;
    if (getStripeId(customer.invoice_settings?.default_payment_method)) return;

    const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
    const paymentMethodId = getStripeId(setupIntent.payment_method);
    if (!paymentMethodId) return;

    await stripe.customers.update(customerId, {
        invoice_settings: { default_payment_method: paymentMethodId },
    });
}

export function stripeFieldErrors(
    error: unknown,
): Record<string, string> | null {
    const stripeError = error as Partial<Stripe.errors.StripeError>;
    if (!stripeError?.type || !stripeError.message) return null;

    const field = stripeParamToField(stripeError.param ?? "");
    return field
        ? { [field]: stripeError.message }
        : { form: stripeError.message };
}

async function getUserBillingRow(
    db: DrizzleD1Database,
    userId: string,
): Promise<UserBillingRow> {
    const [user] = await db
        .select({
            id: userTable.id,
            name: userTable.name,
            email: userTable.email,
            stripeCustomerId: userTable.stripeCustomerId,
        })
        .from(userTable)
        .where(eq(userTable.id, userId))
        .limit(1);

    if (!user) throw new Error("User not found");
    return user;
}

async function retrieveActiveCustomer(
    stripe: Stripe,
    customerId: string,
): Promise<Stripe.Customer> {
    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted) {
        throw new Error("Stripe customer was deleted");
    }
    return customer;
}

function toBillingProfile(
    customer: Stripe.Customer,
    taxId: Stripe.TaxId | null,
) {
    const accountType =
        customer.metadata?.[METADATA_ACCOUNT_TYPE] === "company"
            ? "company"
            : "individual";
    const address = customer.address;

    return {
        accountType,
        name:
            customer.individual_name ??
            (accountType === "individual" ? (customer.name ?? "") : ""),
        businessName:
            customer.business_name ??
            (accountType === "company" ? (customer.name ?? "") : ""),
        address: {
            line1: address?.line1 ?? "",
            line2: address?.line2 ?? "",
            city: address?.city ?? "",
            state: address?.state ?? "",
            postalCode: address?.postal_code ?? "",
            country: address?.country ?? "",
        },
        taxId: taxId
            ? {
                  id: taxId.id,
                  type: taxId.type,
                  label: getTaxIdLabel(taxId.country ?? address?.country ?? ""),
                  value: taxId.value,
                  country: taxId.country,
                  verificationStatus:
                      taxId.verification?.status ?? "unavailable",
              }
            : null,
        supportedTaxIdType: getTaxIdTypeForCountry(address?.country ?? ""),
        taxIdLabel: getTaxIdLabel(address?.country ?? ""),
    };
}

async function listInvoicesForCustomer(
    stripe: Stripe,
    customerId: string,
    invoiceCursor?: string | null,
) {
    const page = await stripe.invoices.list({
        customer: customerId,
        limit: INVOICE_PAGE_SIZE,
        starting_after: invoiceCursor ?? undefined,
    });
    const nextCursor = page.has_more ? (page.data.at(-1)?.id ?? null) : null;

    return {
        invoices: page.data.map((invoice) => ({
            id: invoice.id,
            number: invoice.number ?? invoice.id,
            created: invoice.created,
            status: invoice.status ?? "unknown",
            amountDue: invoice.amount_due,
            amountPaid: invoice.amount_paid,
            total: invoice.total,
            currency: invoice.currency,
            hostedInvoiceUrl: invoice.hosted_invoice_url,
            invoicePdf: invoice.invoice_pdf,
        })),
        hasMore: Boolean(nextCursor),
        nextCursor,
    };
}

function validateBillingProfile(input: {
    accountType: BillingAccountType;
    name: string;
    businessName: string;
    address: BillingAddress;
    taxId?: { value?: string };
}): Record<string, string> {
    const errors: Record<string, string> = {};

    if (!input.name) errors.name = "Name is required.";
    if (input.name.length > 150) errors.name = "Name is too long.";
    if (input.accountType === "company" && !input.businessName) {
        errors.businessName = "Business name is required.";
    }
    if (input.businessName.length > 150) {
        errors.businessName = "Business name is too long.";
    }
    if (!input.address.line1) errors.line1 = "Address is required.";
    if (input.address.line1.length > 200) {
        errors.line1 = "Address is too long.";
    }
    if (!input.address.city) errors.city = "City is required.";
    if (input.address.city.length > 100) errors.city = "City is too long.";
    if (!input.address.postalCode) {
        errors.postalCode = "Postal code is required.";
    }
    if (input.address.postalCode.length > 32) {
        errors.postalCode = "Postal code is too long.";
    }
    if (input.address.line2.length > 200) {
        errors.line2 = "Address line 2 is too long.";
    }
    if (input.address.state.length > 100) {
        errors.state = "State or region is too long.";
    }
    if (!ISO_COUNTRY_CODE_SET.has(input.address.country)) {
        errors.country = "Country is required.";
    }
    if ((input.taxId?.value?.trim() ?? "").length > 64) {
        errors.taxId = "Tax ID is too long.";
    }

    return errors;
}

function normalizeAddress(address: BillingAddress): BillingAddress {
    return {
        line1: address.line1.trim(),
        line2: address.line2.trim(),
        city: address.city.trim(),
        state: address.state.trim(),
        postalCode: address.postalCode.trim(),
        country: address.country.trim().toUpperCase(),
    };
}

function toStripeAddress(address: BillingAddress): Stripe.AddressParam {
    return {
        line1: address.line1,
        line2: address.line2 || undefined,
        city: address.city,
        state: address.state || undefined,
        postal_code: address.postalCode,
        country: address.country,
    };
}

function getStripeId(
    value: string | { id?: string | null } | null | undefined,
): string | null {
    if (!value) return null;
    if (typeof value === "string") return value;
    return value.id ?? null;
}

function stripeParamToField(param: string): string | null {
    if (param.includes("address[line1]")) return "line1";
    if (param.includes("address[line2]")) return "line2";
    if (param.includes("address[city]")) return "city";
    if (param.includes("address[state]")) return "state";
    if (param.includes("address[postal_code]")) return "postalCode";
    if (param.includes("address[country]")) return "country";
    if (param.includes("tax")) return "taxId";
    if (param.includes("business_name")) return "businessName";
    if (param.includes("individual_name") || param === "name") return "name";
    return null;
}
