export type BookingStatus =
    | "draft"
    | "quoted"
    | "hold"
    | "confirmed"
    | "cancelled"
    | "needs_review";

export type AvailabilityStatus =
    | "available"
    | "held"
    | "booked"
    | "unavailable";

export type InboundMessage = {
    userId: string;
    channel: "cli" | "web" | "discord" | "a2a" | "api";
    text: string;
    now?: Date;
};

export type AgentReply = {
    conversationId: string;
    bookingId: string;
    text: string;
    status: BookingStatus;
    quoteTotal?: number;
    needsReview: boolean;
    toolCalls: string[];
};

export type PerformancePackage = {
    id: string;
    name: string;
    description: string;
    basePrice: number;
    durationMinutes: number;
    travelRadiusKm: number;
    needsReview?: boolean;
};

export type AddOn = {
    id: string;
    name: string;
    price: number;
};

export type AvailabilitySlot = {
    date: string;
    status: AvailabilityStatus;
    bookingId?: string;
};

export type BookingRequest = {
    id: string;
    conversationId: string;
    packageId?: string;
    status: BookingStatus;
    eventDate?: string;
    eventTime?: string;
    eventType?: string;
    venueCity?: string;
    audienceSize?: number;
    budget?: number;
    contactName?: string;
    contactEmail?: string;
    quoteTotal?: number;
    quoteSummary?: string;
    createdAt: string;
    updatedAt: string;
};

export type Conversation = {
    id: string;
    userId: string;
    channel: InboundMessage["channel"];
    createdAt: string;
    updatedAt: string;
};

export type Message = {
    id: string;
    conversationId: string;
    role: "user" | "assistant" | "system";
    content: string;
    createdAt: string;
};

export type EventLog = {
    id: string;
    conversationId?: string;
    bookingId?: string;
    type: string;
    payload: Record<string, unknown>;
    createdAt: string;
};

export type Quote = {
    total: number;
    summary: string;
    needsReview: boolean;
};

export type BookingStore = {
    listPackages(): Promise<PerformancePackage[]>;
    listAddOns(): Promise<AddOn[]>;
    getAvailability(date: string): Promise<AvailabilitySlot | undefined>;
    upsertAvailability(slot: AvailabilitySlot): Promise<void>;
    getOrCreateConversation(input: {
        userId: string;
        channel: InboundMessage["channel"];
        now: string;
    }): Promise<Conversation>;
    addMessage(message: Omit<Message, "id">): Promise<Message>;
    getActiveBooking(
        conversationId: string,
    ): Promise<BookingRequest | undefined>;
    createBooking(input: {
        conversationId: string;
        now: string;
    }): Promise<BookingRequest>;
    updateBooking(
        id: string,
        patch: Partial<Omit<BookingRequest, "id" | "createdAt">>,
    ): Promise<BookingRequest>;
    addEvent(event: Omit<EventLog, "id">): Promise<EventLog>;
    listEvents(): Promise<EventLog[]>;
    getBooking(id: string): Promise<BookingRequest | undefined>;
};
