import { getDb, initSchema } from "./db.js";
import { isMainAdmin } from "../middleware/adminAuth.js";

function mapRowToAuthChat(row) {
    if (!row) return null;
    return {
        chatId: row.chat_id,
        label: row.label,
        createdAt: row.created_at,
    };
}

export class AuthorizedChatRepository {
    constructor(env = {}) {
        this.env = env;
        this.db = getDb(env);
    }

    async ensureReady() {
        await initSchema(this.db);
    }

    async add(chatId, label = null) {
        if (!chatId) return null;
        await this.ensureReady();
        const strId = chatId.toString().trim();
        const now = new Date().toISOString();

        await this.db.prepare(`
            INSERT OR REPLACE INTO authorized_chats (chat_id, label, created_at)
            VALUES (?, ?, ?)
        `).bind(strId, label ? label.trim() : null, now).run();

        return this.getById(strId);
    }

    async remove(chatId) {
        if (!chatId) return false;
        await this.ensureReady();
        const strId = chatId.toString().trim();

        await this.db.prepare(`
            DELETE FROM authorized_chats WHERE chat_id = ?
        `).bind(strId).run();

        return true;
    }

    async getById(chatId) {
        if (!chatId) return null;
        await this.ensureReady();
        const strId = chatId.toString().trim();

        const row = await this.db.prepare(`
            SELECT * FROM authorized_chats WHERE chat_id = ?
        `).bind(strId).first();

        return mapRowToAuthChat(row);
    }

    async getAll() {
        await this.ensureReady();
        const res = await this.db.prepare(`
            SELECT * FROM authorized_chats ORDER BY created_at DESC
        `).all();

        return (res.results || []).map(mapRowToAuthChat);
    }

    async count() {
        await this.ensureReady();
        const res = await this.db.prepare(`
            SELECT COUNT(*) as count FROM authorized_chats
        `).first();

        return res?.count || 0;
    }

    /**
     * Checks if a chat/user ID is authorized to use the bot.
     * Strict Whitelist:
     * 1. Main Admin is always authorized.
     * 2. If chat/user is in D1 authorized_chats table -> authorized.
     * 3. If chat/user is in env.AUTHORIZED_CHATS -> authorized.
     * 4. Otherwise -> unauthorized (Private Bot by default).
     */
    async isChatAuthorized(ctx) {
        if (isMainAdmin(ctx)) return true;

        const fromId = ctx?.from?.id ? ctx.from.id.toString() : null;
        const chatId = ctx?.chat?.id ? ctx.chat.id.toString() : null;

        // 1. Check D1 authorized chats
        const dbChats = await this.getAll();
        if (dbChats.length > 0) {
            const isDbAuth = dbChats.some(c => (fromId && c.chatId === fromId) || (chatId && c.chatId === chatId));
            if (isDbAuth) return true;
        }

        // 2. Check env.AUTHORIZED_CHATS
        const envVar = ctx?.env?.AUTHORIZED_CHATS || (typeof process !== 'undefined' ? process.env?.AUTHORIZED_CHATS : undefined);
        if (envVar) {
            const envIds = envVar.toString().split(",").map(id => id.trim()).filter(Boolean);
            if (envIds.length > 0) {
                const isEnvAuth = (fromId && envIds.includes(fromId)) || (chatId && envIds.includes(chatId));
                if (isEnvAuth) return true;
            }
        }

        // Strictly deny anyone else
        return false;
    }
}
