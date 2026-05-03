import type {
    BookingRequest,
    BookingStatus,
    BookingStore,
    InboundMessage,
    PerformancePackage,
    Quote,
} from "./types.js";

export type ParsedBookingDetails = {
    packageId?: string;
    eventDate?: string;
    eventTime?: string;
    eventType?: string;
    venueCity?: string;
    audienceSize?: number;
    budget?: number;
    contactEmail?: string;
};

const packageHints: Array<[string, string[]]> = [
    ["jazz-trio", ["jazz", "trio", "cocktail", "gala"]],
    ["dj-hybrid", ["dj", "dance", "club", "sax"]],
    ["full-band", ["band", "wedding", "festival", "party"]],
    ["solo-acoustic", ["solo", "acoustic", "ceremony", "dinner", "guitar"]],
];

function trimEmailToken(token: string): string {
    let start = 0;
    let end = token.length;
    const trimChars = new Set([
        "<",
        ">",
        "(",
        ")",
        "[",
        "]",
        '"',
        "'",
        ",",
        ".",
    ]);
    while (start < end && trimChars.has(token[start])) start += 1;
    while (end > start && trimChars.has(token[end - 1])) end -= 1;
    return token.slice(start, end);
}

function extractEmail(text: string): string | undefined {
    for (const part of text.split(/\s+/)) {
        const token = trimEmailToken(part.replace(/^mailto:/i, ""));
        const at = token.indexOf("@");
        const dot = token.lastIndexOf(".");
        if (
            at > 0 &&
            dot > at + 1 &&
            dot < token.length - 1 &&
            !token.includes("..")
        ) {
            return token;
        }
    }
    return undefined;
}

export function collectEventDetails(text: string): ParsedBookingDetails {
    const lower = text.toLowerCase();
    const packageId = packageHints.find(([, hints]) =>
        hints.some((hint) => lower.includes(hint)),
    )?.[0];

    const date = text.match(/\b20\d{2}-\d{2}-\d{2}\b/)?.[0];
    const time = text.match(/\b([01]?\d|2[0-3]):[0-5]\d\b/)?.[0];
    const audience = text.match(
        /\b(\d{2,5})\s*(people|guests|attendees|person)/i,
    );
    const budget = text.match(
        /(?:budget|around|under|up to|€|\$)\s*([0-9][0-9,.]*)/i,
    );
    const email = extractEmail(text);
    const city = text.match(
        /\bin\s+([A-Z][A-Za-z -]{2,})(?:\s+on|\s+for|$)/,
    )?.[1];

    let eventType: string | undefined;
    for (const candidate of [
        "wedding",
        "gala",
        "corporate",
        "birthday",
        "festival",
        "ceremony",
    ]) {
        if (lower.includes(candidate)) {
            eventType = candidate;
            break;
        }
    }

    return {
        packageId,
        eventDate: date,
        eventTime: time,
        eventType,
        venueCity: city?.trim(),
        audienceSize: audience ? Number(audience[1]) : undefined,
        budget: budget ? Number(budget[1].replace(/[,.]/g, "")) : undefined,
        contactEmail: email,
    };
}

export async function listPackages(store: BookingStore): Promise<string> {
    const packages = await store.listPackages();
    return packages
        .map(
            (pkg) =>
                `${pkg.name}: €${pkg.basePrice} for ${pkg.durationMinutes / 60}h. ${pkg.description}`,
        )
        .join("\n");
}

export async function logEvent(
    store: BookingStore,
    event: Parameters<BookingStore["addEvent"]>[0],
) {
    return store.addEvent(event);
}

function travelFeeForCity(city?: string): number {
    if (!city) return 0;
    const normalized = city.toLowerCase();
    if (
        ["berlin", "hamburg", "munich", "cologne"].some((name) =>
            normalized.includes(name),
        )
    ) {
        return 180;
    }
    return 320;
}

export function generateQuote(
    booking: BookingRequest,
    pkg: PerformancePackage,
): Quote {
    const travelFee = travelFeeForCity(booking.venueCity);
    const largeAudienceFee =
        booking.audienceSize && booking.audienceSize > 250 ? 450 : 0;
    const total = pkg.basePrice + travelFee + largeAudienceFee;
    const needsReview =
        Boolean(pkg.needsReview) ||
        (booking.budget !== undefined && booking.budget < total) ||
        Boolean(booking.audienceSize && booking.audienceSize > 500);

    const parts = [
        `${pkg.name}: €${pkg.basePrice}`,
        travelFee ? `travel estimate: €${travelFee}` : undefined,
        largeAudienceFee
            ? `large audience support: €${largeAudienceFee}`
            : undefined,
    ].filter(Boolean);

    return {
        total,
        needsReview,
        summary: `${parts.join(" + ")} = €${total}`,
    };
}

export async function upsertBookingFromMessage(input: {
    store: BookingStore;
    conversationId: string;
    text: string;
    now: string;
}): Promise<{
    booking: BookingRequest;
    quote?: Quote;
    toolCalls: string[];
}> {
    const toolCalls = ["collect_event_details"];
    const parsed = collectEventDetails(input.text);
    const existing =
        (await input.store.getActiveBooking(input.conversationId)) ??
        (await input.store.createBooking({
            conversationId: input.conversationId,
            now: input.now,
        }));
    toolCalls.push("create_update_booking");

    let booking = await input.store.updateBooking(existing.id, {
        ...parsed,
        updatedAt: input.now,
    });

    let quote: Quote | undefined;
    if (booking.packageId && booking.eventDate) {
        const packages = await input.store.listPackages();
        const selected = packages.find((pkg) => pkg.id === booking.packageId);
        if (selected) {
            toolCalls.push("generate_quote");
            quote = generateQuote(booking, selected);
            const availability = await input.store.getAvailability(
                booking.eventDate,
            );
            let status: BookingStatus = quote.needsReview
                ? "needs_review"
                : "quoted";
            if (availability?.status === "booked") {
                status = "needs_review";
            }
            if (status === "needs_review") {
                toolCalls.push("handoff_needs_review");
            }
            booking = await input.store.updateBooking(booking.id, {
                quoteTotal: quote.total,
                quoteSummary: quote.summary,
                status,
                updatedAt: input.now,
            });
        }
    }

    if (/\b(hold|reserve|tentative)\b/i.test(input.text) && booking.eventDate) {
        const availability = await input.store.getAvailability(
            booking.eventDate,
        );
        if (
            availability &&
            availability.status !== "available" &&
            availability.bookingId !== booking.id
        ) {
            toolCalls.push("handoff_needs_review");
            booking = await input.store.updateBooking(booking.id, {
                status: "needs_review",
                updatedAt: input.now,
            });
        } else {
            toolCalls.push("place_hold");
            await input.store.upsertAvailability({
                date: booking.eventDate,
                status: "held",
                bookingId: booking.id,
            });
            booking = await input.store.updateBooking(booking.id, {
                status: "hold",
                updatedAt: input.now,
            });
        }
    }

    if (/\b(confirm|book it|approved)\b/i.test(input.text)) {
        toolCalls.push("confirm_booking");
        if (booking.eventDate) {
            await input.store.upsertAvailability({
                date: booking.eventDate,
                status: "booked",
                bookingId: booking.id,
            });
        }
        booking = await input.store.updateBooking(booking.id, {
            status: "confirmed",
            updatedAt: input.now,
        });
    }

    toolCalls.push("log_event");
    await logEvent(input.store, {
        conversationId: input.conversationId,
        bookingId: booking.id,
        type: "tool_calls",
        payload: { toolCalls, parsed },
        createdAt: input.now,
    });

    return { booking, quote, toolCalls };
}

export function isPackageListRequest(message: InboundMessage): boolean {
    return /\b(package|packages|options|price|prices|offerings|menu)\b/i.test(
        message.text,
    );
}
