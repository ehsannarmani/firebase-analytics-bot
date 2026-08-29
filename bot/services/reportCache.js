import { getDb, initSchema } from "../db/db.js";

// In-memory LRU cache for ultra-fast access
const memoryCache = new Map();
const TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

/**
 * Generates a compact safe report ID (e.g. r_m0abc12_9x3a).
 */
export function generateReportId() {
    const timestamp = Date.now().toString(36);
    const rand = Math.random().toString(36).substring(2, 6);
    return `r_${timestamp}_${rand}`;
}

/**
 * Saves report analytics context for subsequent chart rendering.
 * 
 * @param {object} env - Worker environment
 * @param {string} reportType - e.g. 'daily', 'new_users', 'min30', 'users', 'versions', 'countries', 'engagement', 'events'
 * @param {Array|object} results - Exact analytics results returned by execution
 * @param {object} metadata - Extra details (e.g. isFiltered, projectName, title, dateRange)
 * @returns {Promise<string>} reportId
 */
export async function saveReportContext(env, reportType, results, metadata = {}) {
    const reportId = generateReportId();
    const expiresAt = Date.now() + TTL_MS;

    const payload = {
        id: reportId,
        type: reportType,
        results: sanitizeResultsForChart(results),
        metadata,
        expiresAt,
    };

    // 1. Store in memory
    memoryCache.set(reportId, payload);

    // Evict old entries if memory cache grows large
    if (memoryCache.size > 200) {
        const now = Date.now();
        for (const [k, v] of memoryCache.entries()) {
            if (v.expiresAt < now) {
                memoryCache.delete(k);
            }
        }
    }

    // 2. Persist to D1 admin_states table for cross-worker isolate durability
    try {
        const db = getDb(env);
        if (db && typeof db.prepare === 'function') {
            await initSchema(db);
            const jsonStr = JSON.stringify(payload);
            await db.prepare(`
                INSERT OR REPLACE INTO admin_states (chat_id, state, data, updated_at)
                VALUES (?, ?, ?, ?)
            `).bind(`chart_${reportId}`, reportType, jsonStr, expiresAt).run();
        }
    } catch (e) {
        // Fallback to memory cache only
    }

    return reportId;
}

/**
 * Retrieves cached report context for chart rendering.
 * 
 * @param {object} env - Worker environment
 * @param {string} reportId - Report identifier
 * @returns {Promise<object|null>}
 */
export async function getReportContext(env, reportId) {
    if (!reportId) return null;

    // 1. Check memory cache
    const memEntry = memoryCache.get(reportId);
    if (memEntry) {
        if (memEntry.expiresAt > Date.now()) {
            return memEntry;
        }
        memoryCache.delete(reportId);
        return null;
    }

    // 2. Check D1 database
    try {
        const db = getDb(env);
        if (db && typeof db.prepare === 'function') {
            const row = await db.prepare(`
                SELECT * FROM admin_states WHERE chat_id = ?
            `).bind(`chart_${reportId}`).first();

            if (row && row.data) {
                const parsed = JSON.parse(row.data);
                if (parsed.expiresAt > Date.now()) {
                    memoryCache.set(reportId, parsed);
                    return parsed;
                }
            }
        }
    } catch (e) {
        console.warn("Could not query D1 report cache:", e.message);
    }

    return null;
}

/**
 * Strips credentials and private keys from result objects so only statistical data is cached.
 */
function sanitizeResultsForChart(results) {
    if (!Array.isArray(results)) {
        return results;
    }

    return results.map(res => ({
        account: {
            id: res.account?.id || 'unknown',
            name: res.account?.name || 'Default',
            propertyId: res.account?.propertyId || '',
        },
        success: Boolean(res.success),
        data: res.data,
        error: res.error || null,
    }));
}
