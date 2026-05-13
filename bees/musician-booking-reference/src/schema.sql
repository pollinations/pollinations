CREATE TABLE config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE packages (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  base_price INTEGER NOT NULL,
  duration_minutes INTEGER NOT NULL,
  travel_radius_km INTEGER NOT NULL,
  needs_review INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE add_ons (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price INTEGER NOT NULL
);

CREATE TABLE availability (
  date TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('available', 'held', 'booked', 'unavailable')),
  booking_id TEXT
);

CREATE TABLE booking_requests (
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

CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  conversation_id TEXT,
  booking_id TEXT,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);
