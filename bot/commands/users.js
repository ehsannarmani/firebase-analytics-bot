import { InlineKeyboard } from "grammy";
import { getLifetimeActiveUsers, runMultiAccountExecution } from '../services/analytics.js';
import { resolveTargetAccounts } from '../services/projectResolver.js';
import { saveReportContext } from '../services/reportCache.js';
import { getFormattedDate } from '../services/dateUtils.js';
import { buildRefreshCallback } from './refreshCallback.js';

/**
 * Pure report generator for Lifetime Users (shared between command and refresh callback).
 */
export async function generateUsersReport(env, { projectArg = "" } = {}) {
    const { accounts, isFiltered, matchedName, error } = await resolveTargetAccounts({ env }, projectArg);
    if (error) {
        return { text: error, keyboard: undefined, error };
    }

    const results = await runMultiAccountExecution(accounts, async (account) => {
        return await getLifetimeActiveUsers(account);
    });

    let finalMessage = `👥 <b>Total Lifetime Active Users:</b>\n`;
    let total = 0;
    let successfulCount = 0;

    for (const res of results) {
        finalMessage += `\n━━━━━━━━━━━━━━━━━━\n`;
        finalMessage += `🔥 <b>${res.account.name}</b>\n`;
        if (res.success) {
            finalMessage += `Lifetime Users: <code>${res.data}</code>\n`;
            total += Number(res.data) || 0;
            successfulCount++;
        } else {
            finalMessage += `❌ <i>Failed to retrieve statistics</i>\n`;
        }
    }

    if (results.length > 1 && successfulCount > 0) {
        finalMessage += `\n━━━━━━━━━━━━━━━━━━\n`;
        finalMessage += `📈 <b>Combined Lifetime Users:</b> <code>${total}</code>\n`;
    }

    finalMessage += `\n⏳ <i>Updated at ${getFormattedDate()}</i>`;

    const keyboard = new InlineKeyboard();
    let reportId = null;

    if (successfulCount > 0) {
        reportId = await saveReportContext(env, 'users', results, {
            isFiltered,
            projectName: matchedName,
            queryParams: { type: 'users', projectArg }
        });
        keyboard.text("📈 View as Chart", `chart:${reportId}`);
    }

    const refreshCb = buildRefreshCallback('users', { projectArg }, reportId);
    keyboard.text("🔄 Refresh", refreshCb);

    return { text: finalMessage, keyboard, results, successfulCount };
}

export function setupUsersCommand(bot) {
    bot.command("users", async (ctx) => {
        const projectArg = (ctx.match || "").trim();
        const scopeLabel = projectArg ? `<b>${projectArg}</b>` : "all connected projects";
        const loadingMessage = await ctx.reply(`Getting total lifetime users for ${scopeLabel}...`, { parse_mode: "HTML" });

        try {
            const report = await generateUsersReport(ctx.env, { projectArg });
            await ctx.reply(report.text, { parse_mode: 'HTML', reply_markup: report.keyboard });
        } catch (error) {
            console.error('Error fetching lifetime active users:', error);
            await ctx.reply("❌ Failed to fetch lifetime active users. Please try again later.");
        } finally {
            try {
                await ctx.deleteMessages([loadingMessage.message_id]);
            } catch (e) {}
        }
    });
}
