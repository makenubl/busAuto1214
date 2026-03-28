CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT UNIQUE NOT NULL,
  name TEXT,
  location TEXT,
  notes TEXT,
  added_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  raw_message TEXT,
  parsed TEXT,
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'active', 'closed')),
  created_at TEXT DEFAULT (datetime('now')),
  closed_at TEXT
);

CREATE TABLE IF NOT EXISTS responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL,
  seller_phone TEXT NOT NULL,
  message_text TEXT,
  media_urls TEXT DEFAULT '[]',
  received_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (request_id) REFERENCES requests(id)
);

CREATE TABLE IF NOT EXISTS dealers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  jid TEXT UNIQUE NOT NULL,
  name TEXT,
  added_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dealer_invites (
  code TEXT PRIMARY KEY,
  created_by TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS messages_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender TEXT,
  recipient TEXT,
  body TEXT,
  media_url TEXT,
  direction TEXT CHECK(direction IN ('incoming', 'outgoing')),
  timestamp TEXT DEFAULT (datetime('now'))
);
