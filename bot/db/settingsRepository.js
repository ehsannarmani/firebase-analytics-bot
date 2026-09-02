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

    /**
     * Resolves whether 30-minute updates to the update channel are enabled:
     * 1. Dynamic setting in D1 bot_settings ('channel_min30_enabled')
     * 2. Fallback to ENABLE_MIN30_UPDATES / MIN30_CHANNEL_ENABLED env variables
     * 3. Defaults to true (enabled)
     */
    async isMin30UpdateEnabled(env = this.env) {
        try {
            const dbVal = await this.get('channel_min30_enabled');
            if (dbVal !== null && dbVal !== undefined && dbVal.trim() !== '') {
                const normalized = dbVal.trim().toLowerCase();
                return normalized === '1' || normalized === 'true' || normalized === 'yes';
            }
        } catch (e) {
            console.warn("Could not retrieve channel_min30_enabled from DB:", e.message);
        }

        const envVal = env?.ENABLE_MIN30_UPDATES || env?.MIN30_CHANNEL_ENABLED || env?.MIN30_UPDATES_ENABLED ||
            (typeof process !== 'undefined' ? (process.env?.ENABLE_MIN30_UPDATES || process.env?.MIN30_CHANNEL_ENABLED || process.env?.MIN30_UPDATES_ENABLED) : undefined);
        if (envVal !== undefined && envVal !== null && envVal.toString().trim() !== '') {
            const str = envVal.toString().trim().toLowerCase();
            return str === '1' || str === 'true' || str === 'yes';
        }

        // Default to enabled to preserve existing behavior
        return true;
    }

    async setMin30UpdateEnabled(enabled) {
        return await this.set('channel_min30_enabled', enabled ? '1' : '0');
    }
}
