import { InlineKeyboard } from "grammy";
import { getLifetimeUsersByCountry, runMultiAccountExecution } from '../services/analytics.js';
import { formatLifetimeUsersByCountry, getFormattedDate } from '../services/dateUtils.js';
import { resolveTargetAccounts, normalizeSlug } from '../services/projectResolver.js';
import { saveReportContext } from '../services/reportCache.js';
import { FirebaseAccountRepository } from '../db/accountRepository.js';
import { buildRefreshCallback } from './refreshCallback.js';

/**
 * Pure report generator for Lifetime Users by Country (shared between command and refresh callback).
 */
export async function generateCountriesReport(env, { projectArg = "", requestedCountries = [] } = {}) {
    const { accounts, isFiltered, matchedName, error } = await resolveTargetAccounts({ env }, projectArg);
    if (error) {
        return { text: error, keyboard: undefined, error };
    }

    const results = await runMultiAccountExecution(accounts, async (account) => {
        return await getLifetimeUsersByCountry(account);
    });

    let finalMessage = `🌍 <b>Total Lifetime Users by Country</b>\n`;
    let successfulCount = 0;

    for (const res of results) {
        finalMessage += `\n━━━━━━━━━━━━━━━━━━\n`;
        finalMessage += `🔥 <b>${res.account.name}</b>\n\n`;

        if (res.success && res.data && res.data.length > 0) {
            successfulCount++;
            const formatted = formatLifetimeUsersByCountry(res.data, requestedCountries);
            finalMessage += (formatted || "<i>No matching countries found.</i>") + "\n";
        } else if (res.success && (!res.data || res.data.length === 0)) {
            finalMessage += `<i>No country data available.</i>\n`;
        } else {
            finalMessage += `❌ <i>Failed to retrieve statistics</i>\n`;
        }
    }

    finalMessage += `\n⏳ <i>Updated at ${getFormattedDate()}</i>`;

    const keyboard = new InlineKeyboard();
    let reportId = null;

    if (successfulCount > 0) {
        reportId = await saveReportContext(env, 'countries', results, {
            isFiltered,
            projectName: matchedName,
            queryParams: { type: 'countries', projectArg, requestedCountries }
        });
        keyboard.text("📈 View as Chart", `chart:${reportId}`);
    }

    const refreshCb = buildRefreshCallback('countries', { projectArg, requestedCountries }, reportId);
    keyboard.text("🔄 Refresh", refreshCb);

    return { text: finalMessage, keyboard, results, successfulCount };
}

export function setupCountriesCommand(bot) {
    bot.command("countries", async (ctx) => {
        const rawTokens = (ctx.match || "").trim().split(/\s+/).filter(Boolean);

        let projectArg = "";
        let requestedCountries = [];

        if (rawTokens.length > 0) {
            // Check if first token corresponds to a known project
            const repo = new FirebaseAccountRepository(ctx.env);
            let allAccounts = [];
            try {
                allAccounts = await repo.getAll();
            } catch (e) {}

            const firstTokenSlug = normalizeSlug(rawTokens[0]);
            const isProjectMatch = allAccounts.some(a => 
                normalizeSlug(a.name) === firstTokenSlug || 
                normalizeSlug(a.id) === firstTokenSlug ||
                normalizeSlug(a.name).includes(firstTokenSlug)
            );

            if (isProjectMatch) {
                projectArg = rawTokens[0];
                requestedCountries = rawTokens.slice(1);
            } else if (rawTokens.every(t => /^[a-zA-Z]{2,3}$/.test(t))) {
                // All tokens look like country codes (e.g. US, UK, DE)
                projectArg = "";
                requestedCountries = rawTokens;
            } else {
                // Ambiguous or single argument -> assume project filter
                projectArg = rawTokens[0];
                requestedCountries = rawTokens.slice(1);
            }
        }

        const scopeLabel = projectArg ? `<b>${projectArg}</b>` : "all connected projects";
        const loadingMessage = await ctx.reply(`Getting total lifetime users by country for ${scopeLabel}...`, { parse_mode: "HTML" });

        try {
            const report = await generateCountriesReport(ctx.env, { projectArg, requestedCountries });
            await ctx.reply(report.text, { parse_mode: 'HTML', reply_markup: report.keyboard });
        } catch (error) {
            console.error('Error fetching lifetime users by country:', error);
            await ctx.reply("❌ Failed to fetch lifetime users by country. Please try again later.");
        } finally {
            try {
                await ctx.deleteMessages([loadingMessage.message_id]);
            } catch (e) {}
        }
    });
}
