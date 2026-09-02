import { InlineKeyboard } from "grammy";
import { getAverageEngagementTime, runMultiAccountExecution } from '../services/analytics.js';
import { resolveTargetAccounts } from '../services/projectResolver.js';
import { saveReportContext } from '../services/reportCache.js';
import { getFormattedDate } from '../services/dateUtils.js';
import { buildRefreshCallback } from './refreshCallback.js';

function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    if (mins > 0) {
        return `${mins}m ${secs}s`;
    }
    return `${secs}s`;
}

/**
 * Pure report generator for Engagement Time (shared between command and refresh callback).
 */
export async function generateEngagementReport(env, { projectArg = "" } = {}) {
    const { accounts, isFiltered, matchedName, error } = await resolveTargetAccounts({ env }, projectArg);
    if (error) {
        return { text: error, keyboard: undefined, error };
    }

    const results = await runMultiAccountExecution(accounts, async (account) => {
        return (await getAverageEngagementTime(account)).reverse();
    });

    let finalMessage = `⏱ <b>Avg Engagement Time (Last 7 Days)</b>\n<i>Date | Avg Duration | Engagement Rate</i>\n`;
    let successfulCount = 0;

    for (const res of results) {
        finalMessage += `\n━━━━━━━━━━━━━━━━━━\n`;
        finalMessage += `🔥 <b>${res.account.name}</b>\n\n`;

        if (res.success && res.data && res.data.length > 0) {
            successfulCount++;
            const msg = res.data
                .map(day => {
                    const rate = (day.engagementRate * 100).toFixed(1);
                    let result = `📍 <code>${day.date}</code> ⏱ <code>${formatDuration(day.avgSessionDuration)}</code> 📈 <code>${rate}%</code>`;
                    if (day.grow) {
                        if (day.grow < 0) {
                            result += ` 🔴 <code>${day.grow}%</code>`;
                        } else {
                            result += ` 🟢 <code>+${day.grow}%</code>`;
                        }
                    }
                    return result;
                })
                .join("\n");
            finalMessage += msg + "\n";
        } else if (res.success && (!res.data || res.data.length === 0)) {
            finalMessage += `<i>No engagement data available.</i>\n`;
        } else {
            finalMessage += `❌ <i>Failed to retrieve statistics</i>\n`;
        }
    }

    finalMessage += `\n⏳ <i>Updated at ${getFormattedDate()}</i>`;

    const keyboard = new InlineKeyboard();
    let reportId = null;

    if (successfulCount > 0) {
        reportId = await saveReportContext(env, 'engagement', results, {
            isFiltered,
            projectName: matchedName,
            queryParams: { type: 'engagement', projectArg }
        });
        keyboard.text("📈 View as Chart", `chart:${reportId}`);
    }

    const refreshCb = buildRefreshCallback('engagement', { projectArg }, reportId);
    keyboard.text("🔄 Refresh", refreshCb);

    return { text: finalMessage, keyboard, results, successfulCount };
}

export function setupEngagementCommand(bot) {
    bot.command("engagement", async (ctx) => {
        const projectArg = (ctx.match || "").trim();
        const scopeLabel = projectArg ? `<b>${projectArg}</b>` : "all connected projects";
        const loadingMessage = await ctx.reply(`Getting engagement time report for ${scopeLabel}...`, { parse_mode: "HTML" });

        try {
            const report = await generateEngagementReport(ctx.env, { projectArg });
            await ctx.reply(report.text, { parse_mode: 'HTML', reply_markup: report.keyboard });
        } catch (error) {
            console.error('Error fetching engagement time:', error);
            await ctx.reply("❌ Failed to fetch engagement time report. Please try again later.");
        } finally {
            try {
                await ctx.deleteMessages([loadingMessage.message_id]);
            } catch (e) {}
        }
    });
}
