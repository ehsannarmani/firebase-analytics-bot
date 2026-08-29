import { InlineKeyboard } from "grammy";
import { getPeriodComparison, runMultiAccountExecution } from '../services/analytics.js';
import { resolveTargetAccounts, normalizeSlug } from '../services/projectResolver.js';
import { saveReportContext } from '../services/reportCache.js';
import { FirebaseAccountRepository } from '../db/accountRepository.js';

function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
}

function formatDelta(deltaStr) {
    const num = parseFloat(deltaStr);
    if (isNaN(num)) return `<code>0%</code>`;
    if (num > 0) return `🟢 <code>+${num}%</code>`;
    if (num < 0) return `🔴 <code>${num}%</code>`;
    return `⚪️ <code>0%</code>`;
}

export function setupCompareCommand(bot) {
    bot.command("compare", async (ctx) => {
        const rawTokens = (ctx.match || "").trim().split(/\s+/).filter(Boolean);

        let projectArg = "";
        let days = 7;

        // Parse tokens (can be [project], [days], or [project days] / [days project])
        const repo = new FirebaseAccountRepository(ctx.env);
        let allAccounts = [];
        try {
            allAccounts = await repo.getAll();
        } catch (e) {}

        for (const token of rawTokens) {
            const dayMatch = token.match(/^(\d+)(d|days)?$/i);
            if (dayMatch) {
                days = parseInt(dayMatch[1], 10);
                continue;
            }

            const tokenSlug = normalizeSlug(token);
            const isProject = allAccounts.some(a =>
                normalizeSlug(a.name) === tokenSlug ||
                normalizeSlug(a.id) === tokenSlug ||
                normalizeSlug(a.name).includes(tokenSlug)
            );

            if (isProject) {
                projectArg = token;
            } else if (!projectArg) {
                projectArg = token;
            }
        }

        const { accounts, isFiltered, matchedName, error } = await resolveTargetAccounts(ctx, projectArg);
        if (error) {
            return ctx.reply(error, { parse_mode: "HTML" });
        }

        const scopeLabel = isFiltered ? `<b>${matchedName}</b>` : "all connected projects";
        const loadingMessage = await ctx.reply(`Analyzing ${days}-day period comparison for ${scopeLabel}...`, { parse_mode: "HTML" });

        try {
            const results = await runMultiAccountExecution(accounts, async (account) => {
                return await getPeriodComparison(account, days);
            });

            let finalMessage = `📊 <b>Period Comparison (${days} Days vs Previous ${days} Days)</b>\n` +
                               `<i>Current Period vs Previous Period</i>\n`;
            let successfulCount = 0;

            for (const res of results) {
                finalMessage += `\n━━━━━━━━━━━━━━━━━━\n`;
                finalMessage += `🔥 <b>${res.account.name}</b>\n\n`;

                if (res.success && res.data) {
                    successfulCount++;
                    const { current, previous, deltas } = res.data;

                    finalMessage += `👥 <b>Active Users:</b> <code>${current.activeUsers.toLocaleString()}</code> vs <code>${previous.activeUsers.toLocaleString()}</code> (${formatDelta(deltas.activeUsers)})\n` +
                                   `✨ <b>New Users:</b> <code>${current.newUsers.toLocaleString()}</code> vs <code>${previous.newUsers.toLocaleString()}</code> (${formatDelta(deltas.newUsers)})\n` +
                                   `🔄 <b>Sessions:</b> <code>${current.sessions.toLocaleString()}</code> vs <code>${previous.sessions.toLocaleString()}</code> (${formatDelta(deltas.sessions)})\n` +
                                   `⏱ <b>Avg Session:</b> <code>${formatDuration(current.avgDuration)}</code> vs <code>${formatDuration(previous.avgDuration)}</code> (${formatDelta(deltas.avgDuration)})\n`;
                } else {
                    finalMessage += `❌ <i>Failed to retrieve comparison statistics</i>\n`;
                }
            }

            let replyMarkup = undefined;
            if (successfulCount > 0) {
                const reportId = await saveReportContext(ctx.env, 'compare', results, {
                    isFiltered,
                    projectName: matchedName,
                    periodDays: days,
                });
                replyMarkup = new InlineKeyboard().text("📈 View Comparison Chart", `chart:${reportId}`);
            }

            await ctx.reply(finalMessage, { parse_mode: 'HTML', reply_markup: replyMarkup });
        } catch (error) {
            console.error('Error fetching period comparison:', error);
            await ctx.reply("❌ Failed to fetch period comparison. Please try again later.");
        } finally {
            try {
                await ctx.deleteMessages([loadingMessage.message_id]);
            } catch (e) {}
        }
    });
}
