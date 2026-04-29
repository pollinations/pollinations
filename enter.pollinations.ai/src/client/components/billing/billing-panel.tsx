import {
    type FC,
    useCallback,
    useEffect,
    useId,
    useMemo,
    useState,
} from "react";
import { Button } from "../button.tsx";
import { Card } from "../ui/card.tsx";
import { Input } from "../ui/input.tsx";
import { Panel } from "../ui/panel.tsx";
import { Tooltip } from "../ui/tooltip.tsx";

type BillingAccountType = "individual" | "company";

type BillingAddress = {
    line1: string;
    line2: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
};

type BillingProfile = {
    accountType: BillingAccountType;
    name: string;
    businessName: string;
    address: BillingAddress;
    taxId: {
        id: string;
        type: string;
        label: string;
        value: string;
        country: string | null;
        verificationStatus:
            | "pending"
            | "verified"
            | "unverified"
            | "unavailable";
    } | null;
    supportedTaxIdType: string | null;
    taxIdLabel: string;
};

type TaxVerificationStatus = NonNullable<
    BillingProfile["taxId"]
>["verificationStatus"];

type BillingCard = {
    id: string;
    brand: string;
    last4: string;
    expMonth: number | null;
    expYear: number | null;
    isDefault: boolean;
};

type BillingInvoice = {
    id: string;
    number: string;
    created: number;
    status: string;
    amountDue: number;
    amountPaid: number;
    total: number;
    currency: string;
    hostedInvoiceUrl: string | null;
    invoicePdf: string | null;
};

type CountryOption = {
    code: string;
    name: string;
    taxIdType: string | null;
    taxIdLabel: string;
};

type BillingResponse = {
    profile: BillingProfile;
    cards: BillingCard[];
    invoices: BillingInvoice[];
    invoiceCursor: string | null;
    hasMoreInvoices: boolean;
};

type CountriesResponse = {
    countries: CountryOption[];
};

type InvoicePageState = {
    invoices: BillingInvoice[];
    invoiceCursor: string | null;
    hasMoreInvoices: boolean;
};

const INVOICE_ROWS_PER_PAGE = 8;

export const BillingPanel: FC = () => {
    const [data, setData] = useState<BillingResponse | null>(null);
    const [form, setForm] = useState<BillingProfile | null>(null);
    const [taxIdValue, setTaxIdValue] = useState("");
    const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
    const [invoiceCursor, setInvoiceCursor] = useState<string | null>(null);
    const [hasMoreInvoices, setHasMoreInvoices] = useState(false);
    const [countryOptions, setCountryOptions] = useState<CountryOption[]>([]);
    const [previousInvoicePages, setPreviousInvoicePages] = useState<
        InvoicePageState[]
    >([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [saving, setSaving] = useState(false);
    const [editingBillingDetails, setEditingBillingDetails] = useState(false);
    const [addingCard, setAddingCard] = useState(false);
    const [cardActionId, setCardActionId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

    const selectedCountry = form?.address.country ?? "";
    const selectedCountryOption = useMemo(
        () =>
            countryOptions.find((country) => country.code === selectedCountry),
        [countryOptions, selectedCountry],
    );
    const taxIdType = selectedCountryOption?.taxIdType ?? null;
    const showTaxIdField = form?.accountType === "company" && !!taxIdType;
    const taxIdLabel = selectedCountryOption?.taxIdLabel ?? "Tax ID";
    const hasAddress = form ? hasBillingAddress(form) : false;
    const invoicePageNumber = previousInvoicePages.length + 1;
    const invoicePageLabel = `Page ${invoicePageNumber}`;
    const invoicePlaceholderRowCount = Math.max(
        0,
        INVOICE_ROWS_PER_PAGE - invoices.length,
    );
    const invoicePlaceholderRowIds = buildInvoicePlaceholderRowIds(
        invoices.length === 0
            ? INVOICE_ROWS_PER_PAGE - 1
            : invoicePlaceholderRowCount,
    );

    const fetchBilling = useCallback(
        async (cursor?: string | null, previousPage?: InvoicePageState) => {
            if (cursor) {
                setLoadingMore(true);
            } else {
                setLoading(true);
            }
            setError(null);

            try {
                const params = new URLSearchParams();
                if (cursor) params.set("invoice_cursor", cursor);
                const response = await fetch(
                    `/api/stripe/billing${params.size ? `?${params.toString()}` : ""}`,
                    { credentials: "include" },
                );
                if (!response.ok) throw new Error("Failed to load billing");
                const next = (await response.json()) as BillingResponse;

                setData(next);
                setInvoices(next.invoices);
                setInvoiceCursor(next.invoiceCursor);
                setHasMoreInvoices(next.hasMoreInvoices);

                if (cursor && previousPage) {
                    setPreviousInvoicePages((current) => [
                        ...current,
                        previousPage,
                    ]);
                } else if (!cursor) {
                    setPreviousInvoicePages([]);
                }

                if (!cursor) {
                    setForm(next.profile);
                    setTaxIdValue(next.profile.taxId?.value ?? "");
                    setEditingBillingDetails(false);
                }
            } catch (err) {
                setError(
                    err instanceof Error
                        ? err.message
                        : "Failed to load billing",
                );
            } finally {
                setLoading(false);
                setLoadingMore(false);
            }
        },
        [],
    );

    const fetchCountryOptions = useCallback(async () => {
        try {
            const response = await fetch("/api/stripe/billing/countries", {
                credentials: "include",
            });
            if (!response.ok) throw new Error("Failed to load countries");
            const payload = (await response.json()) as CountriesResponse;
            setCountryOptions(payload.countries);
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Failed to load countries",
            );
        }
    }, []);

    useEffect(() => {
        void fetchBilling();
    }, [fetchBilling]);

    useEffect(() => {
        void fetchCountryOptions();
    }, [fetchCountryOptions]);

    const sortedCards = useMemo(
        () =>
            [...(data?.cards ?? [])].sort((a, b) =>
                a.isDefault === b.isDefault ? 0 : a.isDefault ? -1 : 1,
            ),
        [data?.cards],
    );

    async function refreshBilling(): Promise<void> {
        const response = await fetch("/api/stripe/billing", {
            credentials: "include",
        });
        if (!response.ok) throw new Error("Failed to refresh billing");
        const next = (await response.json()) as BillingResponse;
        setData(next);
        setInvoices(next.invoices);
        setInvoiceCursor(next.invoiceCursor);
        setHasMoreInvoices(next.hasMoreInvoices);
        setPreviousInvoicePages([]);
        setForm(next.profile);
        setTaxIdValue(next.profile.taxId?.value ?? "");
        setEditingBillingDetails(false);
    }

    function startBillingDetailsEdit(): void {
        setSaved(false);
        setFieldErrors({});
        setError(null);
        setEditingBillingDetails(true);
    }

    function cancelBillingDetailsEdit(): void {
        if (data?.profile) {
            setForm(data.profile);
            setTaxIdValue(data.profile.taxId?.value ?? "");
        }
        setFieldErrors({});
        setSaved(false);
        setEditingBillingDetails(false);
    }

    function updateAddress<K extends keyof BillingAddress>(
        key: K,
        value: BillingAddress[K],
    ): void {
        setForm((current) =>
            current
                ? {
                      ...current,
                      address: { ...current.address, [key]: value },
                  }
                : current,
        );
    }

    async function saveProfile(event: React.FormEvent): Promise<void> {
        event.preventDefault();
        if (!form) return;

        setSaving(true);
        setError(null);
        setSaved(false);
        setFieldErrors({});

        const response = await fetch("/api/stripe/billing/profile", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
                accountType: form.accountType,
                name: form.name,
                businessName: form.businessName,
                address: form.address,
                taxId: { value: showTaxIdField ? taxIdValue : "" },
            }),
        });

        try {
            const payload = (await response.json()) as {
                profile?: BillingProfile;
                error?: string;
                fieldErrors?: Record<string, string>;
            };

            if (!response.ok || !payload.profile) {
                setFieldErrors(payload.fieldErrors ?? {});
                setError(payload.error ?? "Failed to save billing profile");
                return;
            }

            const profile = payload.profile;
            setForm(profile);
            setTaxIdValue(profile.taxId?.value ?? "");
            setData((current) => (current ? { ...current, profile } : current));
            setEditingBillingDetails(false);
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } finally {
            setSaving(false);
        }
    }

    async function addCard(): Promise<void> {
        setAddingCard(true);
        setError(null);
        try {
            const response = await fetch("/api/stripe/payment-methods/setup", {
                method: "POST",
                credentials: "include",
            });
            const payload = (await response.json()) as {
                url?: string;
                error?: string;
            };
            if (!response.ok || !payload.url) {
                throw new Error(payload.error ?? "Failed to add card");
            }
            window.location.href = payload.url;
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to add card");
            setAddingCard(false);
        }
    }

    async function deleteCard(card: BillingCard): Promise<void> {
        const confirmed = window.confirm(
            `Remove ${formatBrand(card.brand)} ending in ${card.last4}?`,
        );
        if (!confirmed) return;

        setCardActionId(card.id);
        setError(null);
        try {
            const response = await fetch(
                `/api/stripe/payment-methods/${card.id}`,
                { method: "DELETE", credentials: "include" },
            );
            if (!response.ok) throw new Error("Failed to remove card");
            await refreshBilling();
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Failed to remove card",
            );
        } finally {
            setCardActionId(null);
        }
    }

    async function makeDefault(card: BillingCard): Promise<void> {
        setCardActionId(card.id);
        setError(null);
        try {
            const response = await fetch(
                `/api/stripe/payment-methods/${card.id}/default`,
                { method: "PATCH", credentials: "include" },
            );
            if (!response.ok) throw new Error("Failed to update default card");
            await refreshBilling();
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Failed to update default card",
            );
        } finally {
            setCardActionId(null);
        }
    }

    function nextInvoicePage(): void {
        if (!invoiceCursor) return;
        void fetchBilling(invoiceCursor, {
            invoices,
            invoiceCursor,
            hasMoreInvoices,
        });
    }

    function previousInvoicePage(): void {
        const previousPage = previousInvoicePages.at(-1);
        if (!previousPage) return;

        setPreviousInvoicePages((current) => current.slice(0, -1));
        setInvoices(previousPage.invoices);
        setInvoiceCursor(previousPage.invoiceCursor);
        setHasMoreInvoices(previousPage.hasMoreInvoices);
        setData((current) =>
            current
                ? {
                      ...current,
                      invoices: previousPage.invoices,
                      invoiceCursor: previousPage.invoiceCursor,
                      hasMoreInvoices: previousPage.hasMoreInvoices,
                  }
                : current,
        );
    }

    if (loading && !data) {
        return (
            <Panel color="amber">
                <p className="text-sm text-amber-900">Loading billing...</p>
            </Panel>
        );
    }

    return (
        <Panel color="amber" className="space-y-4">
            {error && (
                <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                </div>
            )}

            {form && (
                <Card color="gray" className="space-y-4 bg-white/90">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-3">
                            <h3 className="text-lg font-semibold text-amber-950">
                                Billing details
                            </h3>
                            {saved && (
                                <span className="text-sm font-medium text-green-700">
                                    Saved
                                </span>
                            )}
                        </div>
                        {!editingBillingDetails && (
                            <Button
                                as="button"
                                color="amber"
                                weight={hasAddress ? "light" : "strong"}
                                onClick={startBillingDetailsEdit}
                            >
                                {hasAddress ? "Edit" : "Set billing address"}
                            </Button>
                        )}
                    </div>

                    {editingBillingDetails ? (
                        <form className="space-y-4" onSubmit={saveProfile}>
                            <div className="flex w-fit rounded-full bg-amber-50 p-1">
                                {(["individual", "company"] as const).map(
                                    (type) => (
                                        <button
                                            key={type}
                                            type="button"
                                            onClick={() =>
                                                setForm((current) =>
                                                    current
                                                        ? {
                                                              ...current,
                                                              accountType: type,
                                                          }
                                                        : current,
                                                )
                                            }
                                            className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
                                                form.accountType === type
                                                    ? "bg-amber-300 text-amber-950"
                                                    : "text-amber-800 hover:bg-amber-100"
                                            }`}
                                        >
                                            {type === "individual"
                                                ? "Individual"
                                                : "Company"}
                                        </button>
                                    ),
                                )}
                            </div>

                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                <Field
                                    label={
                                        form.accountType === "company"
                                            ? "Contact name"
                                            : "Name"
                                    }
                                    error={fieldErrors.name}
                                    value={form.name}
                                    onChange={(value) =>
                                        setForm({ ...form, name: value })
                                    }
                                />
                                {form.accountType === "company" && (
                                    <Field
                                        label="Business name"
                                        error={fieldErrors.businessName}
                                        value={form.businessName}
                                        onChange={(value) =>
                                            setForm({
                                                ...form,
                                                businessName: value,
                                            })
                                        }
                                    />
                                )}
                                <Field
                                    label="Address"
                                    error={fieldErrors.line1}
                                    value={form.address.line1}
                                    onChange={(value) =>
                                        updateAddress("line1", value)
                                    }
                                />
                                <Field
                                    label="City"
                                    error={fieldErrors.city}
                                    value={form.address.city}
                                    onChange={(value) =>
                                        updateAddress("city", value)
                                    }
                                />
                                <Field
                                    label="Postal code"
                                    error={fieldErrors.postalCode}
                                    value={form.address.postalCode}
                                    onChange={(value) =>
                                        updateAddress("postalCode", value)
                                    }
                                />
                                <label className="flex flex-col gap-1 text-sm font-medium text-amber-950">
                                    Country
                                    <select
                                        value={form.address.country}
                                        onChange={(event) => {
                                            updateAddress(
                                                "country",
                                                event.target.value,
                                            );
                                            setTaxIdValue("");
                                        }}
                                        className={`rounded-lg border px-3 py-2 text-sm focus:outline-none focus-visible:border-green-500 focus-visible:ring-1 focus-visible:ring-green-500/60 ${
                                            fieldErrors.country
                                                ? "border-red-400"
                                                : "border-gray-300"
                                        }`}
                                    >
                                        <option value="">Select country</option>
                                        {countryOptions.map((country) => (
                                            <option
                                                key={country.code}
                                                value={country.code}
                                            >
                                                {country.name}
                                            </option>
                                        ))}
                                    </select>
                                    {fieldErrors.country && (
                                        <span className="text-xs text-red-600">
                                            {fieldErrors.country}
                                        </span>
                                    )}
                                </label>
                                {showTaxIdField && (
                                    <Field
                                        label={taxIdLabel}
                                        error={fieldErrors.taxId}
                                        value={taxIdValue}
                                        onChange={setTaxIdValue}
                                    />
                                )}
                            </div>

                            {form.accountType === "company" && form.taxId && (
                                <p className="text-sm text-amber-800">
                                    {form.taxId.label}: {form.taxId.value} -{" "}
                                    {formatTaxStatus(
                                        form.taxId.verificationStatus,
                                    )}
                                </p>
                            )}

                            <div className="flex justify-end gap-2">
                                <Button
                                    as="button"
                                    type="button"
                                    color="amber"
                                    weight="light"
                                    onClick={cancelBillingDetailsEdit}
                                    disabled={saving}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    as="button"
                                    type="submit"
                                    color="amber"
                                    weight="strong"
                                    disabled={saving}
                                >
                                    {saving ? "Saving..." : "Save details"}
                                </Button>
                            </div>
                        </form>
                    ) : (
                        <div>
                            {hasAddress ? (
                                <div className="space-y-1 text-sm">
                                    <p className="font-semibold text-amber-950">
                                        {formatBillingName(form)}
                                    </p>
                                    <div className="text-amber-800">
                                        {formatBillingAddress(
                                            form,
                                            selectedCountryOption?.name,
                                        ).map((line) => (
                                            <p key={line}>{line}</p>
                                        ))}
                                    </div>
                                    {form.accountType === "company" &&
                                        form.taxId && (
                                            <p className="text-amber-800">
                                                {form.taxId.label}:{" "}
                                                {form.taxId.value} -{" "}
                                                {formatTaxStatus(
                                                    form.taxId
                                                        .verificationStatus,
                                                )}
                                            </p>
                                        )}
                                </div>
                            ) : (
                                <p className="text-sm text-amber-800">
                                    No billing address set.
                                </p>
                            )}
                        </div>
                    )}
                </Card>
            )}

            <Card color="gray" className="space-y-3 bg-white/90">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <h3 className="text-lg font-semibold text-amber-950">
                        Payment methods
                    </h3>
                    <Button
                        as="button"
                        color="amber"
                        weight="light"
                        onClick={addCard}
                        disabled={addingCard}
                    >
                        {addingCard ? "Opening..." : "Add card"}
                    </Button>
                </div>

                {sortedCards.length === 0 ? (
                    <p className="text-sm text-amber-800">No saved cards.</p>
                ) : (
                    <div className="divide-y divide-gray-100 rounded-lg bg-white/60">
                        {sortedCards.map((card) => (
                            <div
                                key={card.id}
                                className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between"
                            >
                                <div>
                                    <p className="font-semibold text-amber-950">
                                        {formatBrand(card.brand)} ending in{" "}
                                        {card.last4}
                                    </p>
                                    <p className="text-sm text-amber-800">
                                        Expires{" "}
                                        {formatExpiry(
                                            card.expMonth,
                                            card.expYear,
                                        )}
                                        {card.isDefault ? " - Default" : ""}
                                    </p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {!card.isDefault && (
                                        <Button
                                            as="button"
                                            color="amber"
                                            weight="light"
                                            size="small"
                                            onClick={() => makeDefault(card)}
                                            disabled={cardActionId === card.id}
                                        >
                                            Make default
                                        </Button>
                                    )}
                                    <Button
                                        as="button"
                                        color="red"
                                        weight="light"
                                        size="small"
                                        onClick={() => deleteCard(card)}
                                        disabled={cardActionId === card.id}
                                    >
                                        Delete
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Card>

            <Card color="gray" className="space-y-3 bg-white/90">
                <h3 className="flex items-center text-lg font-semibold text-amber-950">
                    Invoices
                    <Tooltip
                        content="Purchases before May 1, 2026 remain available from the Stripe receipt email sent at purchase time."
                        ariaLabel="Older invoice availability"
                        className="ml-1"
                    >
                        <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-gray-300 bg-white font-body text-[10px] font-bold leading-none text-gray-600">
                            i
                        </span>
                    </Tooltip>
                </h3>

                <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] table-fixed text-left text-sm">
                        <thead className="border-b border-gray-200 text-amber-900">
                            <tr>
                                <th className="w-[18%] py-2 pr-3 font-semibold">
                                    Date
                                </th>
                                <th className="w-[28%] py-2 pr-3 font-semibold">
                                    Invoice
                                </th>
                                <th className="w-[18%] py-2 pr-3 font-semibold">
                                    Status
                                </th>
                                <th className="w-[18%] py-2 pr-3 font-semibold">
                                    Amount
                                </th>
                                <th className="w-[18%] py-2 pr-3 font-semibold">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {invoices.map((invoice) => (
                                <tr key={invoice.id} className="h-11">
                                    <td className="py-2 pr-3 text-amber-950">
                                        {formatDate(invoice.created)}
                                    </td>
                                    <td className="py-2 pr-3 font-medium text-amber-950">
                                        {invoice.number}
                                    </td>
                                    <td className="py-2 pr-3 capitalize text-amber-800">
                                        {invoice.status}
                                    </td>
                                    <td className="py-2 pr-3 text-amber-950">
                                        {formatCurrency(
                                            invoice.total,
                                            invoice.currency,
                                        )}
                                    </td>
                                    <td className="py-2 pr-3">
                                        <div className="flex gap-2">
                                            {invoice.hostedInvoiceUrl && (
                                                <a
                                                    href={
                                                        invoice.hostedInvoiceUrl
                                                    }
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="font-medium text-amber-800 underline decoration-amber-400 underline-offset-2 hover:text-amber-950"
                                                >
                                                    View
                                                </a>
                                            )}
                                            {invoice.invoicePdf && (
                                                <a
                                                    href={invoice.invoicePdf}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="font-medium text-amber-800 underline decoration-amber-400 underline-offset-2 hover:text-amber-950"
                                                >
                                                    Download
                                                </a>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {invoices.length === 0 && (
                                <tr className="h-11">
                                    <td
                                        colSpan={5}
                                        className="py-2 pr-3 text-amber-800"
                                    >
                                        No invoices yet.
                                    </td>
                                </tr>
                            )}
                            {invoicePlaceholderRowIds.map((rowId) => (
                                <tr key={rowId} className="h-11">
                                    <td className="py-2 pr-3" colSpan={5}>
                                        &nbsp;
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {(previousInvoicePages.length > 0 || hasMoreInvoices) && (
                    <div className="flex items-center justify-center gap-2 pt-2">
                        <Button
                            as="button"
                            color="amber"
                            weight="light"
                            size="small"
                            className="flex h-8 w-8 items-center justify-center p-0"
                            onClick={previousInvoicePage}
                            disabled={
                                loadingMore || previousInvoicePages.length === 0
                            }
                            aria-label="Previous invoice page"
                        >
                            <ChevronIcon direction="left" />
                        </Button>
                        <span className="min-w-16 text-center text-sm text-amber-800">
                            {invoicePageLabel}
                        </span>
                        <Button
                            as="button"
                            color="amber"
                            weight="light"
                            size="small"
                            className="flex h-8 w-8 items-center justify-center p-0"
                            onClick={nextInvoicePage}
                            disabled={loadingMore || !hasMoreInvoices}
                            aria-label="Next invoice page"
                        >
                            <ChevronIcon direction="right" />
                        </Button>
                    </div>
                )}
            </Card>
        </Panel>
    );
};

type FieldProps = {
    label: string;
    value: string;
    error?: string;
    onChange: (value: string) => void;
};

const Field: FC<FieldProps> = ({ label, value, error, onChange }) => {
    const id = useId();

    return (
        <div className="flex flex-col gap-1 text-sm font-medium text-amber-950">
            <label htmlFor={id}>{label}</label>
            <Input
                id={id}
                value={value}
                error={!!error}
                onChange={(event) => onChange(event.target.value)}
                className="text-sm"
            />
            {error && <span className="text-xs text-red-600">{error}</span>}
        </div>
    );
};

const ChevronIcon: FC<{ direction: "left" | "right" }> = ({ direction }) => (
    <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.25"
    >
        {direction === "left" ? (
            <path d="M10 4 6 8l4 4" />
        ) : (
            <path d="m6 4 4 4-4 4" />
        )}
    </svg>
);

function buildInvoicePlaceholderRowIds(count: number): string[] {
    const rowIds: string[] = [];
    for (let row = 0; row < count; row += 1) {
        rowIds.push(`invoice-placeholder-${row}`);
    }
    return rowIds;
}

function hasBillingAddress(profile: BillingProfile): boolean {
    return Boolean(
        profile.address.line1 &&
            profile.address.city &&
            profile.address.postalCode &&
            profile.address.country,
    );
}

function formatBillingName(profile: BillingProfile): string {
    if (profile.accountType === "company") {
        return profile.businessName || profile.name || "Company";
    }
    return profile.name || "Individual";
}

function formatBillingAddress(
    profile: BillingProfile,
    countryName?: string,
): string[] {
    const { address } = profile;
    return [
        address.line1,
        [address.postalCode, address.city].filter(Boolean).join(" "),
        countryName || address.country,
    ].filter(Boolean);
}

function formatTaxStatus(status: TaxVerificationStatus) {
    if (status === "verified") return "Verified";
    if (status === "unverified") return "Unverified";
    if (status === "pending") return "Pending verification";
    return "Verification unavailable";
}

function formatBrand(brand: string): string {
    return brand
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

function formatExpiry(month: number | null, year: number | null): string {
    if (!month || !year) return "-";
    return `${month.toString().padStart(2, "0")}/${year}`;
}

function formatDate(seconds: number): string {
    return new Date(seconds * 1000).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}

function formatCurrency(amount: number, currency: string): string {
    return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: currency.toUpperCase(),
    }).format(amount / 100);
}
