import { InlineKeyboard } from "grammy";
import { getActiveUsersLast30Minutes, runMultiAccountExecution } from '../services/analytics.js';
import { getFormattedDate } from '../services/dateUtils.js';
import { resolveTargetAccounts } from '../services/projectResolver.js';
import { saveReportContext } from '../services/reportCache.js';
import { buildRefreshCallback } from './refreshCallback.js';

/**
 * Pure report generator for 30-minute Active Users (shared between command and refresh callback).
 */
export async function generateMin30Report(env, { projectArg = "" } = {}) {
    const { accounts, isFiltered, matchedName, error } = await resolveTargetAccounts({ env }, projectArg);
    if (error) {
        return { text: error, keyboard: undefined, error };
    }

    const results = await runMultiAccountExecution(accounts, async (account) => {
        return await getActiveUsersLast30Minutes(account);
    });

    let finalMessage = `📍 <b>Active users in last 30 minutes:</b>\n`;
    let total = 0;
    let successfulCount = 0;

    for (const res of results) {
        finalMessage += `\n━━━━━━━━━━━━━━━━━━\n`;
        finalMessage += `🔥 <b>${res.account.name}</b>\n`;
        if (res.success) {
            finalMessage += `Active users: <code>${res.data}</code>\n`;
            total += Number(res.data) || 0;
            successfulCount++;
        } else {
            finalMessage += `❌ <i>Failed to retrieve statistics</i>\n`;
        }
    }

    if (results.length > 1 && successfulCount > 0) {
        finalMessage += `\n━━━━━━━━━━━━━━━━━━\n`;
        finalMessage += `📈 <b>Total Active Users:</b> <code>${total}</code>\n`;
    }

    finalMessage += `\n⏳ <i>Updated at ${getFormattedDate()}</i>`;

    const keyboard = new InlineKeyboard();
    let reportId = null;

    if (successfulCount > 0) {
        reportId = await saveReportContext(env, 'min30', results, {
            isFiltered,
            projectName: matchedName,
            queryParams: { type: 'min30', projectArg }
        });
        keyboard.text("📈 View as Chart", `chart:${reportId}`);
    }

    const refreshCb = buildRefreshCallback('min30', { projectArg }, reportId);
    keyboard.text("🔄 Refresh", refreshCb);

    return { text: finalMessage, keyboard, results, successfulCount };
}

export function setupMin30Command(bot) {
    bot.command("min30", async (ctx) => {
        const projectArg = (ctx.match || "").trim();
        const scopeLabel = projectArg ? `<b>${projectArg}</b>` : "all connected projects";
        const loadingMessage = await ctx.reply(`Getting last 30 minutes active report for ${scopeLabel}...`, { parse_mode: "HTML" });

        try {
            const report = await generateMin30Report(ctx.env, { projectArg });
            await ctx.reply(report.text, { parse_mode: 'HTML', reply_markup: report.keyboard });
        } catch (e) {
            console.error('Error fetching last 30 minutes active users:', e);
            await ctx.reply("❌ Failed to fetch last 30 minutes active users. Please try again later.");
        } finally {
            try {
                await ctx.deleteMessages([loadingMessage.message_id]);
            } catch (e) {}
        }
    });
}
