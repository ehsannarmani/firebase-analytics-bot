import { FirebaseAccountRepository } from "../db/accountRepository.js";
import { getAccountsForExecution } from "./analytics.js";

/**
 * Normalizes a string identifier for comparison (lowercase, trimmed, dashes/underscores/spaces collapsed).
 */
export function normalizeSlug(str) {
    if (!str) return "";
    return str.toString().trim().toLowerCase().replace(/[\s_-]+/g, "");
}

/**
 * Resolves target Firebase accounts for an analytics command based on an optional user input argument.
 * 
 * @param {object} ctx - grammY context containing env
 * @param {string|null} projectArg - user-provided project name or slug (or empty/null)
 * @returns {Promise<{ accounts: Array, isFiltered: boolean, matchedName: string|null, error: string|null }>}
 */
export async function resolveTargetAccounts(ctx, projectArg = "") {
    const rawArg = (projectArg || "").trim();

    // 1. No filter specified -> Return all enabled accounts
    if (!rawArg) {
        const accounts = await getAccountsForExecution(ctx.env);
        if (!accounts || accounts.length === 0) {
            return {
                accounts: [],
                isFiltered: false,
                matchedName: null,
                error: "📭 No enabled Firebase accounts found. Please add accounts in /admin."
            };
        }
        return {
            accounts,
            isFiltered: false,
            matchedName: null,
            error: null,
        };
    }

    // 2. Filter specified -> Query all accounts from DB (and legacy fallback)
    const repo = new FirebaseAccountRepository(ctx.env);
    let allAccounts = [];
    try {
        allAccounts = await repo.getAll();
    } catch (e) {
        console.warn("Could not retrieve all accounts:", e);
    }

    if (allAccounts.length === 0) {
        // Check legacy accounts fallback
        allAccounts = await getAccountsForExecution(ctx.env);
    }

    const querySlug = normalizeSlug(rawArg);

    // Exact match on slug, name, ID, or propertyId
    let matched = allAccounts.find(a => 
        normalizeSlug(a.name) === querySlug ||
        normalizeSlug(a.id) === querySlug ||
        a.propertyId === rawArg
    );

    // Substring match on name if exact match not found
    if (!matched) {
        matched = allAccounts.find(a => normalizeSlug(a.name).includes(querySlug));
    }

    if (!matched) {
        return {
            accounts: [],
            isFiltered: true,
            matchedName: null,
            error: `❌ <b>Firebase project not found.</b>\n\n` +
                   `Project: <code>${rawArg}</code>\n\n` +
                   `<i>Use /projects to see all available configured projects.</i>`
        };
    }

    if (!matched.enabled) {
        return {
            accounts: [],
            isFiltered: true,
            matchedName: matched.name,
            error: `⚠️ <b>Firebase project is currently disabled.</b>\n\n` +
                   `Project: <b>${matched.name}</b> (Property: <code>${matched.propertyId}</code>)\n\n` +
                   `<i>You can re-enable it anytime in /admin ➔ Firebase Accounts.</i>`
        };
    }

    return {
        accounts: [matched],
        isFiltered: true,
        matchedName: matched.name,
        error: null,
    };
}
