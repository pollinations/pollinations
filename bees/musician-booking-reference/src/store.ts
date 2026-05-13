import type {
    AddOn,
    AvailabilitySlot,
    BookingRequest,
    BookingStore,
    Conversation,
    EventLog,
    InboundMessage,
    Message,
    PerformancePackage,
} from "./types.js";

const nowIso = () => new Date().toISOString();

function makeId(prefix: string): string {
    return `${prefix}_${globalThis.crypto.randomUUID().slice(0, 8)}`;
}

const seedPackages: PerformancePackage[] = [
    {
        id: "solo-acoustic",
        name: "Solo acoustic set",
        description:
            "Voice and guitar for ceremonies, dinners, and small receptions.",
        basePrice: 650,
        durationMinutes: 60,
        travelRadiusKm: 40,
    },
    {
        id: "jazz-trio",
        name: "Jazz trio",
        description:
            "Piano, upright bass, and drums for receptions or corporate events.",
        basePrice: 1800,
        durationMinutes: 120,
        travelRadiusKm: 80,
    },
    {
        id: "dj-hybrid",
        name: "DJ hybrid set",
        description: "DJ set with live saxophone feature for dance floors.",
        basePrice: 1400,
        durationMinutes: 180,
        travelRadiusKm: 60,
    },
    {
        id: "full-band",
        name: "Full band",
        description:
            "Five-piece party band for weddings and large public events.",
        basePrice: 4200,
        durationMinutes: 180,
        travelRadiusKm: 120,
        needsReview: true,
    },
];

const seedAddOns: AddOn[] = [
    { id: "extra-hour", name: "Extra performance hour", price: 350 },
    { id: "sound-system", name: "Compact sound system", price: 250 },
    { id: "ceremony-mic", name: "Wireless ceremony microphone", price: 120 },
];

export class MemoryBookingStore implements BookingStore {
    private packages = new Map(seedPackages.map((item) => [item.id, item]));
    private addOns = new Map(seedAddOns.map((item) => [item.id, item]));
    private availability = new Map<string, AvailabilitySlot>();
    private conversations = new Map<string, Conversation>();
    private messages = new Map<string, Message>();
    private bookings = new Map<string, BookingRequest>();
    private events: EventLog[] = [];

    async listPackages(): Promise<PerformancePackage[]> {
        return [...this.packages.values()];
    }

    async listAddOns(): Promise<AddOn[]> {
        return [...this.addOns.values()];
    }

    async getAvailability(date: string): Promise<AvailabilitySlot | undefined> {
        return this.availability.get(date);
    }

    async upsertAvailability(slot: AvailabilitySlot): Promise<void> {
        this.availability.set(slot.date, { ...slot });
    }

    async getOrCreateConversation(input: {
        userId: string;
        channel: InboundMessage["channel"];
        now: string;
    }): Promise<Conversation> {
        const existing = [...this.conversations.values()].find(
            (conversation) =>
                conversation.userId === input.userId &&
                conversation.channel === input.channel,
        );
        if (existing) {
            existing.updatedAt = input.now;
            return { ...existing };
        }

        const conversation: Conversation = {
            id: makeId("conv"),
            userId: input.userId,
            channel: input.channel,
            createdAt: input.now,
            updatedAt: input.now,
        };
        this.conversations.set(conversation.id, conversation);
        return { ...conversation };
    }

    async addMessage(message: Omit<Message, "id">): Promise<Message> {
        const record: Message = { ...message, id: makeId("msg") };
        this.messages.set(record.id, record);
        const conversation = this.conversations.get(record.conversationId);
        if (conversation) {
            conversation.updatedAt = record.createdAt;
        }
        return { ...record };
    }

    async getActiveBooking(
        conversationId: string,
    ): Promise<BookingRequest | undefined> {
        return [...this.bookings.values()].find(
            (booking) =>
                booking.conversationId === conversationId &&
                !["confirmed", "cancelled"].includes(booking.status),
        );
    }

    async createBooking(input: {
        conversationId: string;
        now: string;
    }): Promise<BookingRequest> {
        const booking: BookingRequest = {
            id: makeId("book"),
            conversationId: input.conversationId,
            status: "draft",
            createdAt: input.now,
            updatedAt: input.now,
        };
        this.bookings.set(booking.id, booking);
        return { ...booking };
    }

    async updateBooking(
        id: string,
        patch: Partial<Omit<BookingRequest, "id" | "createdAt">>,
    ): Promise<BookingRequest> {
        const booking = this.bookings.get(id);
        if (!booking) {
            throw new Error(`Unknown booking ${id}`);
        }
        const next = {
            ...booking,
            ...patch,
            updatedAt: patch.updatedAt ?? nowIso(),
        };
        this.bookings.set(id, next);
        return { ...next };
    }

    async addEvent(event: Omit<EventLog, "id">): Promise<EventLog> {
        const record: EventLog = { ...event, id: makeId("event") };
        this.events.push(record);
        return { ...record, payload: { ...record.payload } };
    }

    async listEvents(): Promise<EventLog[]> {
        return this.events.map((event) => ({
            ...event,
            payload: { ...event.payload },
        }));
    }

    async getBooking(id: string): Promise<BookingRequest | undefined> {
        const booking = this.bookings.get(id);
        return booking ? { ...booking } : undefined;
    }
}

export function createMemoryBookingStore(): BookingStore {
    return new MemoryBookingStore();
}
