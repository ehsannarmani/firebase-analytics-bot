/**
 * Database client wrapper for Cloudflare D1 with built-in in-memory fallback
 * for local development and standalone testing.
 */

class InMemoryD1Database {
    constructor() {
        this.tables = {
            firebase_accounts: new Map(),
            admin_states: new Map(),
            authorized_chats: new Map(),
            bot_settings: new Map(),
        };
    }

    async exec(sql) {
        // Schema is already defined in memory tables
        return true;
    }

    prepare(sql) {
        const self = this;
        let boundArgs = [];

        return {
            bind(...args) {
                boundArgs = args;
                return this;
            },

            async first(col) {
                const results = await this.all();
                if (!results.results || results.results.length === 0) return null;
                const row = results.results[0];
                return col ? row[col] : row;
            },

            async all() {
                const normalizedSql = sql.trim().toLowerCase().replace(/\s+/g, ' ');

                if (normalizedSql.startsWith("select * from firebase_accounts where id = ?")) {
                    const id = boundArgs[0];
                    const row = self.tables.firebase_accounts.get(id);
                    return { results: row ? [{ ...row }] : [] };
                }

                if (normalizedSql.startsWith("select * from firebase_accounts where enabled = 1")) {
                    const list = Array.from(self.tables.firebase_accounts.values())
                        .filter(a => a.enabled === 1)
                        .map(a => ({ ...a }));
                    return { results: list };
                }

                if (normalizedSql.startsWith("select * from firebase_accounts order by")) {
                    const list = Array.from(self.tables.firebase_accounts.values())
                        .map(a => ({ ...a }))
                        .sort((a, b) => b.created_at.localeCompare(a.created_at));
                    return { results: list };
                }

                if (normalizedSql.startsWith("select count(*) as count from firebase_accounts")) {
                    if (normalizedSql.includes("where enabled = 1")) {
                        const count = Array.from(self.tables.firebase_accounts.values()).filter(a => a.enabled === 1).length;
                        return { results: [{ count }] };
                    }
                    return { results: [{ count: self.tables.firebase_accounts.size }] };
                }

                if (normalizedSql.startsWith("select * from admin_states where chat_id = ?")) {
                    const chatId = boundArgs[0];
                    const row = self.tables.admin_states.get(chatId);
                    return { results: row ? [{ ...row }] : [] };
                }

                if (normalizedSql.startsWith("select * from authorized_chats where chat_id = ?")) {
                    const chatId = boundArgs[0];
                    const row = self.tables.authorized_chats.get(chatId);
                    return { results: row ? [{ ...row }] : [] };
                }

                if (normalizedSql.startsWith("select * from authorized_chats")) {
                    const list = Array.from(self.tables.authorized_chats.values())
                        .map(c => ({ ...c }))
                        .sort((a, b) => b.created_at.localeCompare(a.created_at));
                    return { results: list };
                }

                if (normalizedSql.startsWith("select count(*) as count from authorized_chats")) {
                    return { results: [{ count: self.tables.authorized_chats.size }] };
                }

                if (normalizedSql.startsWith("select * from bot_settings where key = ?")) {
                    const key = boundArgs[0];
                    const row = self.tables.bot_settings.get(key);
                    return { results: row ? [{ ...row }] : [] };
                }

                if (normalizedSql.startsWith("select * from bot_settings")) {
                    const list = Array.from(self.tables.bot_settings.values()).map(s => ({ ...s }));
                    return { results: list };
                }

                return { results: [] };
            },

            async run() {
                const normalizedSql = sql.trim().toLowerCase().replace(/\s+/g, ' ');

                // INSERT INTO firebase_accounts
                if (normalizedSql.startsWith("insert into firebase_accounts")) {
                    const [id, name, property_id, service_account_json, enabled, created_at, updated_at] = boundArgs;
                    self.tables.firebase_accounts.set(id, {
                        id,
                        name,
                        property_id,
                        service_account_json,
                        enabled: enabled ? 1 : 0,
                        created_at,
                        updated_at,
                    });
                    return { success: true, meta: { changes: 1 } };
                }

                // UPDATE firebase_accounts SET enabled = ?, updated_at = ? WHERE id = ?
                if (normalizedSql.includes("update firebase_accounts set enabled = ?")) {
                    const [enabled, updated_at, id] = boundArgs;
                    const row = self.tables.firebase_accounts.get(id);
                    if (row) {
                        row.enabled = enabled ? 1 : 0;
                        row.updated_at = updated_at;
                        self.tables.firebase_accounts.set(id, row);
                    }
                    return { success: true, meta: { changes: row ? 1 : 0 } };
                }

                // Generic UPDATE firebase_accounts
                if (normalizedSql.startsWith("update firebase_accounts")) {
                    const id = boundArgs[boundArgs.length - 1];
                    const row = self.tables.firebase_accounts.get(id);
                    if (row) {
                        if (normalizedSql.includes("name = ?")) {
                            row.name = boundArgs[0];
                        }
                        if (normalizedSql.includes("property_id = ?")) {
                            row.property_id = boundArgs[normalizedSql.includes("name = ?") ? 1 : 0];
                        }
                        if (normalizedSql.includes("service_account_json = ?")) {
                            row.service_account_json = boundArgs[0];
                        }
                        row.updated_at = boundArgs[boundArgs.length - 2] || new Date().toISOString();
                        self.tables.firebase_accounts.set(id, row);
                    }
                    return { success: true, meta: { changes: row ? 1 : 0 } };
                }

                // DELETE FROM firebase_accounts WHERE id = ?
                if (normalizedSql.startsWith("delete from firebase_accounts where id = ?")) {
                    const id = boundArgs[0];
                    const existed = self.tables.firebase_accounts.delete(id);
                    return { success: true, meta: { changes: existed ? 1 : 0 } };
                }

                // INSERT OR REPLACE INTO admin_states
                if (normalizedSql.startsWith("insert or replace into admin_states") || normalizedSql.startsWith("insert into admin_states")) {
                    const [chat_id, state, data, updated_at] = boundArgs;
                    self.tables.admin_states.set(chat_id, {
                        chat_id,
                        state,
                        data,
                        updated_at,
                    });
                    return { success: true, meta: { changes: 1 } };
                }

                // DELETE FROM admin_states WHERE chat_id = ?
                if (normalizedSql.startsWith("delete from admin_states where chat_id = ?")) {
                    const chatId = boundArgs[0];
                    const existed = self.tables.admin_states.delete(chatId);
                    return { success: true, meta: { changes: existed ? 1 : 0 } };
                }

                // INSERT OR REPLACE INTO authorized_chats
                if (normalizedSql.startsWith("insert or replace into authorized_chats") || normalizedSql.startsWith("insert into authorized_chats")) {
                    const [chat_id, label, created_at] = boundArgs;
                    self.tables.authorized_chats.set(chat_id, {
                        chat_id,
                        label: label || null,
                        created_at,
                    });
                    return { success: true, meta: { changes: 1 } };
                }

                // DELETE FROM authorized_chats WHERE chat_id = ?
                if (normalizedSql.startsWith("delete from authorized_chats where chat_id = ?")) {
                    const chatId = boundArgs[0];
                    const existed = self.tables.authorized_chats.delete(chatId);
                    return { success: true, meta: { changes: existed ? 1 : 0 } };
                }

                // INSERT OR REPLACE INTO bot_settings
                if (normalizedSql.startsWith("insert or replace into bot_settings") || normalizedSql.startsWith("insert into bot_settings")) {
                    const [key, value, updated_at] = boundArgs;
                    self.tables.bot_settings.set(key, {
                        key,
                        value,
                        updated_at,
                    });
                    return { success: true, meta: { changes: 1 } };
                }

                // DELETE FROM bot_settings WHERE key = ?
                if (normalizedSql.startsWith("delete from bot_settings where key = ?")) {
                    const key = boundArgs[0];
                    const existed = self.tables.bot_settings.delete(key);
                    return { success: true, meta: { changes: existed ? 1 : 0 } };
                }

                return { success: true, meta: { changes: 0 } };
            }
        };
    }
}

// Global fallback instance for environments without D1 binding
const globalInMemoryDb = new InMemoryD1Database();

let schemaInitialized = false;

/**
 * Initializes the database schema on D1 if tables do not exist yet.
 */
export async function initSchema(db) {
    if (!db || typeof db.prepare !== 'function') return;
    if (schemaInitialized) return;

    try {
        await db.prepare(`
            CREATE TABLE IF NOT EXISTS firebase_accounts (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                property_id TEXT NOT NULL,
                service_account_json TEXT NOT NULL,
                enabled INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        `).run();

        await db.prepare(`
            CREATE TABLE IF NOT EXISTS admin_states (
                chat_id TEXT PRIMARY KEY,
                state TEXT NOT NULL,
                data TEXT,
                updated_at INTEGER NOT NULL
            )
        `).run();

        await db.prepare(`
            CREATE TABLE IF NOT EXISTS authorized_chats (
                chat_id TEXT PRIMARY KEY,
                label TEXT,
                created_at TEXT NOT NULL
            )
        `).run();

        await db.prepare(`
            CREATE TABLE IF NOT EXISTS bot_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        `).run();

        await db.prepare(`
            CREATE INDEX IF NOT EXISTS idx_firebase_accounts_enabled ON firebase_accounts(enabled)
        `).run();

        schemaInitialized = true;
    } catch (err) {
        console.warn("Schema initialization notice:", err?.message || err);
    }
}

/**
 * Retrieves the active database instance from env or fallback.
 */
export function getDb(env = {}) {
    const db = env?.DB || (typeof process !== 'undefined' && process.env?.DB ? process.env.DB : null) || globalInMemoryDb;
    return db;
}
