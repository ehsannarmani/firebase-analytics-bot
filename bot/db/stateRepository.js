import { getDb, initSchema } from "./db.js";

export class StateRepository {
    constructor(env = {}) {
        this.env = env;
        this.db = getDb(env);
    }

    async ensureReady() {
        await initSchema(this.db);
    }

    async getState(chatId) {
        if (!chatId) return null;
        await this.ensureReady();
        const strId = chatId.toString();

        const row = await this.db.prepare(`
            SELECT * FROM admin_states WHERE chat_id = ?
        `).bind(strId).first();

        if (!row) return null;

        let parsedData = {};
        if (row.data) {
            try {
                parsedData = JSON.parse(row.data);
            } catch (e) {
                parsedData = {};
            }
        }

        return {
            chatId: row.chat_id,
            state: row.state,
            data: parsedData,
            updatedAt: row.updated_at,
        };
    }

    async setState(chatId, state, data = {}) {
        if (!chatId) return;
        await this.ensureReady();
        const strId = chatId.toString();
        const serializedData = typeof data === 'string' ? data : JSON.stringify(data || {});
        const now = Date.now();

        await this.db.prepare(`
            INSERT OR REPLACE INTO admin_states (chat_id, state, data, updated_at)
            VALUES (?, ?, ?, ?)
        `).bind(strId, state, serializedData, now).run();
    }

    async clearState(chatId) {
        if (!chatId) return;
        await this.ensureReady();
        const strId = chatId.toString();

        await this.db.prepare(`
            DELETE FROM admin_states WHERE chat_id = ?
        `).bind(strId).run();
    }
}
