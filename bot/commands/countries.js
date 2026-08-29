import { InlineKeyboard } from "grammy";
import { getLifetimeUsersByCountry, runMultiAccountExecution } from '../services/analytics.js';
import { formatLifetimeUsersByCountry } from '../services/dateUtils.js';
import { resolveTargetAccounts, normalizeSlug } from '../services/projectResolver.js';
import { saveReportContext } from '../services/reportCache.js';
import { FirebaseAccountRepository } from '../db/accountRepository.js';

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

        const { accounts, isFiltered, matchedName, error } = await resolveTargetAccounts(ctx, projectArg);
        if (error) {
            return ctx.reply(error, { parse_mode: "HTML" });
        }

        const scopeLabel = isFiltered ? `<b>${matchedName}</b>` : "all connected projects";
        const loadingMessage = await ctx.reply(`Getting total lifetime users by country for ${scopeLabel}...`, { parse_mode: "HTML" });

        try {
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

            let replyMarkup = undefined;
            if (successfulCount > 0) {
                const reportId = await saveReportContext(ctx.env, 'countries', results, { isFiltered, projectName: matchedName });
                replyMarkup = new InlineKeyboard().text("📈 View as Chart", `chart:${reportId}`);
            }

            await ctx.reply(finalMessage, { parse_mode: 'HTML', reply_markup: replyMarkup });
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
