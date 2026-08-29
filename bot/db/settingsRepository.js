import { getDb, initSchema } from "./db.js";

export class SettingsRepository {
    constructor(env = {}) {
        this.env = env;
        this.db = getDb(env);
    }

    async ensureReady() {
        await initSchema(this.db);
    }

    async get(key) {
        if (!key) return null;
        await this.ensureReady();

        const row = await this.db.prepare(`
            SELECT * FROM bot_settings WHERE key = ?
        `).bind(key).first();

        return row ? row.value : null;
    }

    async set(key, value) {
        if (!key) return;
        await this.ensureReady();
        const now = new Date().toISOString();
        const strValue = value !== null && value !== undefined ? value.toString().trim() : "";

        await this.db.prepare(`
            INSERT OR REPLACE INTO bot_settings (key, value, updated_at)
            VALUES (?, ?, ?)
        `).bind(key, strValue, now).run();

        return strValue;
    }

    async delete(key) {
        if (!key) return;
        await this.ensureReady();

        await this.db.prepare(`
            DELETE FROM bot_settings WHERE key = ?
        `).bind(key).run();
    }

    /**
     * Resolves the Update Channel ID with fallback hierarchy:
     * 1. Dynamic value configured in D1 bot_settings ('update_channel_id')
     * 2. Fallback to UPDATE_CHANNEL_ID in environment variables / secrets
     */
    async getUpdateChannelId(env = this.env) {
        try {
            const dbVal = await this.get('update_channel_id');
            if (dbVal && dbVal.trim() !== '') {
                return {
                    channelId: dbVal.trim(),
                    source: 'database',
                };
            }
        } catch (e) {
            console.warn("Could not retrieve channel ID from DB:", e.message);
        }

        const envVal = env?.UPDATE_CHANNEL_ID || (typeof process !== 'undefined' ? process.env?.UPDATE_CHANNEL_ID : undefined);
        if (envVal && envVal.toString().trim() !== '') {
            return {
                channelId: envVal.toString().trim(),
                source: 'environment',
            };
        }

        return {
            channelId: null,
            source: 'none',
        };
    }

    async setUpdateChannelId(channelId) {
        return await this.set('update_channel_id', channelId);
    }

    async clearUpdateChannelId() {
        return await this.delete('update_channel_id');
    }
}
