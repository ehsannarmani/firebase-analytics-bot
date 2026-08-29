import { getDb, initSchema } from "./db.js";

function mapRowToAccount(row) {
    if (!row) return null;
    return {
        id: row.id,
        name: row.name,
        propertyId: row.property_id,
        serviceAccountJson: row.service_account_json,
        enabled: Boolean(row.enabled),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export class FirebaseAccountRepository {
    constructor(env = {}) {
        this.env = env;
        this.db = getDb(env);
    }

    async ensureReady() {
        await initSchema(this.db);
    }

    async create({ id, name, propertyId, serviceAccountJson, enabled = true }) {
        await this.ensureReady();
        const accountId = id || `acc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const now = new Date().toISOString();
        const isEnabled = enabled ? 1 : 0;

        await this.db.prepare(`
            INSERT INTO firebase_accounts (id, name, property_id, service_account_json, enabled, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(accountId, name, propertyId, serviceAccountJson, isEnabled, now, now).run();

        return this.getById(accountId);
    }

    async getById(id) {
        await this.ensureReady();
        const row = await this.db.prepare(`
            SELECT * FROM firebase_accounts WHERE id = ?
        `).bind(id).first();

        return mapRowToAccount(row);
    }

    async getAll() {
        await this.ensureReady();
        const res = await this.db.prepare(`
            SELECT * FROM firebase_accounts ORDER BY created_at DESC
        `).all();

        return (res.results || []).map(mapRowToAccount);
    }

    async getEnabled() {
        await this.ensureReady();
        const res = await this.db.prepare(`
            SELECT * FROM firebase_accounts WHERE enabled = 1 ORDER BY created_at ASC
        `).all();

        return (res.results || []).map(mapRowToAccount);
    }

    async update(id, { name, propertyId, serviceAccountJson, enabled }) {
        await this.ensureReady();
        const existing = await this.getById(id);
        if (!existing) return null;

        const updatedName = name !== undefined ? name : existing.name;
        const updatedPropertyId = propertyId !== undefined ? propertyId : existing.propertyId;
        const updatedServiceAccount = serviceAccountJson !== undefined ? serviceAccountJson : existing.serviceAccountJson;
        const updatedEnabled = enabled !== undefined ? (enabled ? 1 : 0) : (existing.enabled ? 1 : 0);
        const now = new Date().toISOString();

        await this.db.prepare(`
            UPDATE firebase_accounts
            SET name = ?, property_id = ?, service_account_json = ?, enabled = ?, updated_at = ?
            WHERE id = ?
        `).bind(updatedName, updatedPropertyId, updatedServiceAccount, updatedEnabled, now, id).run();

        return this.getById(id);
    }

    async setEnabled(id, enabled) {
        await this.ensureReady();
        const isEnabled = enabled ? 1 : 0;
        const now = new Date().toISOString();

        await this.db.prepare(`
            UPDATE firebase_accounts
            SET enabled = ?, updated_at = ?
            WHERE id = ?
        `).bind(isEnabled, now, id).run();

        return this.getById(id);
    }

    async delete(id) {
        await this.ensureReady();
        await this.db.prepare(`
            DELETE FROM firebase_accounts WHERE id = ?
        `).bind(id).run();
        return true;
    }

    async count() {
        await this.ensureReady();
        const totalRow = await this.db.prepare(`
            SELECT COUNT(*) as count FROM firebase_accounts
        `).first();

        const enabledRow = await this.db.prepare(`
            SELECT COUNT(*) as count FROM firebase_accounts WHERE enabled = 1
        `).first();

        return {
            total: totalRow?.count || 0,
            enabled: enabledRow?.count || 0,
        };
    }
}
