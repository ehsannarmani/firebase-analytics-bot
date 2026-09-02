import { InlineKeyboard } from "grammy";
import { getDailyActiveUsersPerAppVersion, runMultiAccountExecution } from '../services/analytics.js';
import { resolveTargetAccounts } from '../services/projectResolver.js';
import { saveReportContext } from '../services/reportCache.js';
import { getFormattedDate } from '../services/dateUtils.js';
import { buildRefreshCallback } from './refreshCallback.js';

/**
 * Pure report generator for Active Users by App Version (shared between command and refresh callback).
 */
export async function generateVersionsReport(env, { projectArg = "" } = {}) {
    const { accounts, isFiltered, matchedName, error } = await resolveTargetAccounts({ env }, projectArg);
    if (error) {
        return { text: error, keyboard: undefined, error };
    }

    const results = await runMultiAccountExecution(accounts, async (account) => {
        return await getDailyActiveUsersPerAppVersion('activeUsers', 'appVersion', account);
    });

    let finalMessage = `👥 <b>Active Users by App Version (Last 7 Days)</b>\n`;
    let successfulCount = 0;

    for (const res of results) {
        finalMessage += `\n━━━━━━━━━━━━━━━━━━\n`;
        finalMessage += `🔥 <b>${res.account.name}</b>\n\n`;

        if (res.success && res.data && res.data.length > 0) {
            successfulCount++;
            const msg = res.data
                .map(item => `📍 <code>${item.version}</code> 👉 <code>${item.users}</code> active users`)
                .join("\n");
            finalMessage += msg + "\n";
        } else if (res.success && (!res.data || res.data.length === 0)) {
            finalMessage += `<i>No version breakdown data available.</i>\n`;
        } else {
            finalMessage += `❌ <i>Failed to retrieve statistics</i>\n`;
        }
    }

    finalMessage += `\n⏳ <i>Updated at ${getFormattedDate()}</i>`;

    const keyboard = new InlineKeyboard();
    let reportId = null;

    if (successfulCount > 0) {
        reportId = await saveReportContext(env, 'versions', results, {
            isFiltered,
            projectName: matchedName,
            queryParams: { type: 'versions', projectArg }
        });
        keyboard.text("📈 View as Chart", `chart:${reportId}`);
    }

    const refreshCb = buildRefreshCallback('versions', { projectArg }, reportId);
    keyboard.text("🔄 Refresh", refreshCb);

    return { text: finalMessage, keyboard, results, successfulCount };
}

export function setupVersionsCommand(bot) {
    bot.command("versions", async (ctx) => {
        const projectArg = (ctx.match || "").trim();
        const scopeLabel = projectArg ? `<b>${projectArg}</b>` : "all connected projects";
        const loadingMessage = await ctx.reply(`Getting active users by app version for ${scopeLabel}...`, { parse_mode: "HTML" });

        try {
            const report = await generateVersionsReport(ctx.env, { projectArg });
            await ctx.reply(report.text, { parse_mode: 'HTML', reply_markup: report.keyboard });
        } catch (error) {
            console.error('Error fetching active users by app versions:', error);
            await ctx.reply("❌ Failed to fetch active users by app versions. Please try again later.");
        } finally {
            try {
                await ctx.deleteMessages([loadingMessage.message_id]);
            } catch (e) {}
        }
    });
}
