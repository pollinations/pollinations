import { createMemoryBookingStore } from "./store.js";
import {
    isPackageListRequest,
    listPackages,
    upsertBookingFromMessage,
} from "./tools.js";
import type { AgentReply, BookingStore, InboundMessage } from "./types.js";

export type MusicianBookingAgent = {
    handleInboundMessage(message: InboundMessage): Promise<AgentReply>;
    store: BookingStore;
};

function missingDetailsPrompt(booking: {
    eventDate?: string;
    packageId?: string;
    venueCity?: string;
    audienceSize?: number;
    contactEmail?: string;
}): string {
    const missing = [
        !booking.packageId && "which performance package you want",
        !booking.eventDate && "event date in YYYY-MM-DD format",
        !booking.venueCity && "event city",
        !booking.audienceSize && "expected audience size",
        !booking.contactEmail && "contact email",
    ].filter(Boolean);

    if (missing.length === 0) return "";
    return `To finish the quote I still need ${missing.join(", ")}.`;
}

function bookingSummary(reply: {
    bookingId: string;
    packageId?: string;
    eventDate?: string;
    venueCity?: string;
    quoteTotal?: number;
    quoteSummary?: string;
    needsReview: boolean;
    status: string;
}): string {
    const lines = [`Booking ${reply.bookingId} is ${reply.status}.`];
    if (reply.packageId) lines.push(`Package: ${reply.packageId}.`);
    if (reply.eventDate) lines.push(`Date: ${reply.eventDate}.`);
    if (reply.venueCity) lines.push(`City: ${reply.venueCity}.`);
    if (reply.quoteTotal) lines.push(`Quote: ${reply.quoteSummary}.`);
    if (reply.needsReview) {
        lines.push(
            "An artist/manager should review this before it is confirmed.",
        );
    }
    return lines.join(" ");
}

export function createMusicianBookingAgent(
    store: BookingStore = createMemoryBookingStore(),
): MusicianBookingAgent {
    return {
        store,
        async handleInboundMessage(
            message: InboundMessage,
        ): Promise<AgentReply> {
            const now = (message.now ?? new Date()).toISOString();
            const conversation = await store.getOrCreateConversation({
                userId: message.userId,
                channel: message.channel,
                now,
            });
            await store.addMessage({
                conversationId: conversation.id,
                role: "user",
                content: message.text,
                createdAt: now,
            });

            const toolCalls: string[] = [];
            let text: string;
            let bookingId = "";
            let status: AgentReply["status"] = "draft";
            let quoteTotal: number | undefined;
            let needsReview = false;

            if (isPackageListRequest(message)) {
                toolCalls.push("list_packages");
                text = await listPackages(store);
                const active =
                    (await store.getActiveBooking(conversation.id)) ??
                    (await store.createBooking({
                        conversationId: conversation.id,
                        now,
                    }));
                bookingId = active.id;
                status = active.status;
            } else {
                const result = await upsertBookingFromMessage({
                    store,
                    conversationId: conversation.id,
                    text: message.text,
                    now,
                });
                toolCalls.push(...result.toolCalls);
                bookingId = result.booking.id;
                status = result.booking.status;
                quoteTotal = result.booking.quoteTotal;
                needsReview = result.booking.status === "needs_review";
                const missing = missingDetailsPrompt(result.booking);
                text = [
                    bookingSummary({
                        bookingId,
                        packageId: result.booking.packageId,
                        eventDate: result.booking.eventDate,
                        venueCity: result.booking.venueCity,
                        quoteTotal: result.booking.quoteTotal,
                        quoteSummary: result.booking.quoteSummary,
                        needsReview,
                        status,
                    }),
                    missing,
                ]
                    .filter(Boolean)
                    .join(" ");
            }

            await store.addMessage({
                conversationId: conversation.id,
                role: "assistant",
                content: text,
                createdAt: now,
            });
            await store.addEvent({
                conversationId: conversation.id,
                bookingId,
                type: "agent_reply",
                payload: { status, quoteTotal, toolCalls },
                createdAt: now,
            });

            return {
                conversationId: conversation.id,
                bookingId,
                text,
                status,
                quoteTotal,
                needsReview,
                toolCalls,
            };
        },
    };
}
