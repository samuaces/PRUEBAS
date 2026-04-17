-- EmailPilot SQLite schema

CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    stripe_id   TEXT UNIQUE,
    email       TEXT,
    plan        TEXT DEFAULT 'free',
    credits     INTEGER DEFAULT 5,
    created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS generations (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER REFERENCES users(id),
    icebreaker_text TEXT NOT NULL,
    profile_url     TEXT,
    timestamp       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER REFERENCES users(id),
    event_type  TEXT NOT NULL,
    metadata    TEXT,
    created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_stripe_id ON users(stripe_id);
CREATE INDEX IF NOT EXISTS idx_generations_user_id ON generations(user_id);
CREATE INDEX IF NOT EXISTS idx_events_user_id ON events(user_id);
