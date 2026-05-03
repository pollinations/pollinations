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
} from "../../types.js";

type SqlValue = string | number | boolean | null | undefined;

export type SqlStorageCursor = {
    toArray(): Array<Record<string, unknown>>;
};

export type SqlStorageLike = {
    exec(query: string, ...bindings: SqlValue[]): SqlStorageCursor;
};

const schema = `
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS packages (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  base_price INTEGER NOT NULL,
  duration_minutes INTEGER NOT NULL,
  travel_radius_km INTEGER NOT NULL,
  needs_review INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS add_ons (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS availability (
  date TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('available', 'held', 'booked', 'unavailable')),
  booking_id TEXT
);

CREATE TABLE IF NOT EXISTS booking_requests (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  package_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('draft', 'quoted', 'hold', 'confirmed', 'cancelled', 'needs_review')),
  event_date TEXT,
  event_time TEXT,
  event_type TEXT,
  venue_city TEXT,
  audience_size INTEGER,
  budget INTEGER,
  contact_name TEXT,
  contact_email TEXT,
  quote_total INTEGER,
  quote_summary TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  conversation_id TEXT,
  booking_id TEXT,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS conversations_identity_idx
  ON conversations(user_id, channel);

CREATE INDEX IF NOT EXISTS booking_requests_active_idx
  ON booking_requests(conversation_id, status);
`;

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

const nowIso = () => new Date().toISOString();

function makeId(prefix: string): string {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function bool(value: unknown): boolean {
    return value === true || value === 1;
}

function optionalString(value: unknown): string | undefined {
    return typeof value === "string" && value ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
    return typeof value === "number" ? value : undefined;
}

function packageFromRow(row: Record<string, unknown>): PerformancePackage {
    return {
        id: String(row.id),
        name: String(row.name),
        description: String(row.description),
        basePrice: Number(row.base_price),
        durationMinutes: Number(row.duration_minutes),
        travelRadiusKm: Number(row.travel_radius_km),
        needsReview: bool(row.needs_review),
    };
}

function addOnFromRow(row: Record<string, unknown>): AddOn {
    return {
        id: String(row.id),
        name: String(row.name),
        price: Number(row.price),
    };
}

function availabilityFromRow(row: Record<string, unknown>): AvailabilitySlot {
    return {
        date: String(row.date),
        status: row.status as AvailabilitySlot["status"],
        bookingId: optionalString(row.booking_id),
    };
}

function conversationFromRow(row: Record<string, unknown>): Conversation {
    return {
        id: String(row.id),
        userId: String(row.user_id),
        channel: row.channel as InboundMessage["channel"],
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
    };
}

function messageFromRow(row: Record<string, unknown>): Message {
    return {
        id: String(row.id),
        conversationId: String(row.conversation_id),
        role: row.role as Message["role"],
        content: String(row.content),
        createdAt: String(row.created_at),
    };
}

function bookingFromRow(row: Record<string, unknown>): BookingRequest {
    return {
        id: String(row.id),
        conversationId: String(row.conversation_id),
        packageId: optionalString(row.package_id),
        status: row.status as BookingRequest["status"],
        eventDate: optionalString(row.event_date),
        eventTime: optionalString(row.event_time),
        eventType: optionalString(row.event_type),
        venueCity: optionalString(row.venue_city),
        audienceSize: optionalNumber(row.audience_size),
        budget: optionalNumber(row.budget),
        contactName: optionalString(row.contact_name),
        contactEmail: optionalString(row.contact_email),
        quoteTotal: optionalNumber(row.quote_total),
        quoteSummary: optionalString(row.quote_summary),
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
    };
}

function eventFromRow(row: Record<string, unknown>): EventLog {
    return {
        id: String(row.id),
        conversationId: optionalString(row.conversation_id),
        bookingId: optionalString(row.booking_id),
        type: String(row.type),
        payload: JSON.parse(String(row.payload)) as Record<string, unknown>,
        createdAt: String(row.created_at),
    };
}

function one<T>(
    rows: Record<string, unknown>[],
    mapper: (row: Record<string, unknown>) => T,
): T | undefined {
    const row = rows[0];
    return row ? mapper(row) : undefined;
}

export class CloudflareSqlBookingStore implements BookingStore {
    constructor(private readonly sql: SqlStorageLike) {
        this.sql.exec(schema);
        this.seed();
    }

    async listPackages(): Promise<PerformancePackage[]> {
        return this.sql
            .exec("SELECT * FROM packages ORDER BY base_price ASC")
            .toArray()
            .map(packageFromRow);
    }

    async listAddOns(): Promise<AddOn[]> {
        return this.sql
            .exec("SELECT * FROM add_ons ORDER BY price ASC")
            .toArray()
            .map(addOnFromRow);
    }

    async getAvailability(date: string): Promise<AvailabilitySlot | undefined> {
        return one(
            this.sql
                .exec("SELECT * FROM availability WHERE date = ?", date)
                .toArray(),
            availabilityFromRow,
        );
    }

    async upsertAvailability(slot: AvailabilitySlot): Promise<void> {
        this.sql.exec(
            `INSERT INTO availability (date, status, booking_id)
             VALUES (?, ?, ?)
             ON CONFLICT(date) DO UPDATE SET
               status = excluded.status,
               booking_id = excluded.booking_id`,
            slot.date,
            slot.status,
            slot.bookingId,
        );
    }

    async getOrCreateConversation(input: {
        userId: string;
        channel: InboundMessage["channel"];
        now: string;
    }): Promise<Conversation> {
        const existing = one(
            this.sql
                .exec(
                    `SELECT * FROM conversations
                     WHERE user_id = ? AND channel = ?
                     ORDER BY updated_at DESC LIMIT 1`,
                    input.userId,
                    input.channel,
                )
                .toArray(),
            conversationFromRow,
        );
        if (existing) {
            this.sql.exec(
                "UPDATE conversations SET updated_at = ? WHERE id = ?",
                input.now,
                existing.id,
            );
            return { ...existing, updatedAt: input.now };
        }

        const conversation: Conversation = {
            id: makeId("conv"),
            userId: input.userId,
            channel: input.channel,
            createdAt: input.now,
            updatedAt: input.now,
        };
        this.sql.exec(
            `INSERT INTO conversations (id, user_id, channel, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?)`,
            conversation.id,
            conversation.userId,
            conversation.channel,
            conversation.createdAt,
            conversation.updatedAt,
        );
        return conversation;
    }

    async addMessage(message: Omit<Message, "id">): Promise<Message> {
        const record: Message = { ...message, id: makeId("msg") };
        this.sql.exec(
            `INSERT INTO messages (id, conversation_id, role, content, created_at)
             VALUES (?, ?, ?, ?, ?)`,
            record.id,
            record.conversationId,
            record.role,
            record.content,
            record.createdAt,
        );
        this.sql.exec(
            "UPDATE conversations SET updated_at = ? WHERE id = ?",
            record.createdAt,
            record.conversationId,
        );
        return record;
    }

    async getActiveBooking(
        conversationId: string,
    ): Promise<BookingRequest | undefined> {
        return one(
            this.sql
                .exec(
                    `SELECT * FROM booking_requests
                     WHERE conversation_id = ?
                       AND status NOT IN ('confirmed', 'cancelled')
                     ORDER BY updated_at DESC LIMIT 1`,
                    conversationId,
                )
                .toArray(),
            bookingFromRow,
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
        this.sql.exec(
            `INSERT INTO booking_requests
               (id, conversation_id, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?)`,
            booking.id,
            booking.conversationId,
            booking.status,
            booking.createdAt,
            booking.updatedAt,
        );
        return booking;
    }

    async updateBooking(
        id: string,
        patch: Partial<Omit<BookingRequest, "id" | "createdAt">>,
    ): Promise<BookingRequest> {
        const existing = await this.getBooking(id);
        if (!existing) throw new Error(`Unknown booking ${id}`);
        const next: BookingRequest = {
            ...existing,
            ...patch,
            updatedAt: patch.updatedAt ?? nowIso(),
        };
        this.sql.exec(
            `UPDATE booking_requests SET
               conversation_id = ?,
               package_id = ?,
               status = ?,
               event_date = ?,
               event_time = ?,
               event_type = ?,
               venue_city = ?,
               audience_size = ?,
               budget = ?,
               contact_name = ?,
               contact_email = ?,
               quote_total = ?,
               quote_summary = ?,
               updated_at = ?
             WHERE id = ?`,
            next.conversationId,
            next.packageId,
            next.status,
            next.eventDate,
            next.eventTime,
            next.eventType,
            next.venueCity,
            next.audienceSize,
            next.budget,
            next.contactName,
            next.contactEmail,
            next.quoteTotal,
            next.quoteSummary,
            next.updatedAt,
            next.id,
        );
        return next;
    }

    async addEvent(event: Omit<EventLog, "id">): Promise<EventLog> {
        const record: EventLog = { ...event, id: makeId("event") };
        this.sql.exec(
            `INSERT INTO events
               (id, conversation_id, booking_id, type, payload, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            record.id,
            record.conversationId,
            record.bookingId,
            record.type,
            JSON.stringify(record.payload),
            record.createdAt,
        );
        return record;
    }

    async listEvents(): Promise<EventLog[]> {
        return this.sql
            .exec("SELECT * FROM events ORDER BY created_at ASC")
            .toArray()
            .map(eventFromRow);
    }

    async getBooking(id: string): Promise<BookingRequest | undefined> {
        return one(
            this.sql
                .exec("SELECT * FROM booking_requests WHERE id = ?", id)
                .toArray(),
            bookingFromRow,
        );
    }

    private seed(): void {
        for (const item of seedPackages) {
            this.sql.exec(
                `INSERT OR IGNORE INTO packages
                   (id, name, description, base_price, duration_minutes, travel_radius_km, needs_review)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                item.id,
                item.name,
                item.description,
                item.basePrice,
                item.durationMinutes,
                item.travelRadiusKm,
                item.needsReview ? 1 : 0,
            );
        }
        for (const item of seedAddOns) {
            this.sql.exec(
                "INSERT OR IGNORE INTO add_ons (id, name, price) VALUES (?, ?, ?)",
                item.id,
                item.name,
                item.price,
            );
        }
    }
}
