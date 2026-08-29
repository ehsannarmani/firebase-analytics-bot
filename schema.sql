-- D1 Database Schema for Firebase Analytics Bot

CREATE TABLE IF NOT EXISTS firebase_accounts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    property_id TEXT NOT NULL,
    service_account_json TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_states (
    chat_id TEXT PRIMARY KEY,
    state TEXT NOT NULL,
    data TEXT,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS authorized_chats (
    chat_id TEXT PRIMARY KEY,
    label TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bot_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_firebase_accounts_enabled ON firebase_accounts(enabled);
