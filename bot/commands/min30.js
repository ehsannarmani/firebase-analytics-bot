import { InlineKeyboard } from "grammy";
import { getActiveUsersLast30Minutes, runMultiAccountExecution } from '../services/analytics.js';
import { getFormattedDate } from '../services/dateUtils.js';
import { resolveTargetAccounts } from '../services/projectResolver.js';
import { saveReportContext } from '../services/reportCache.js';

export function setupMin30Command(bot) {
    bot.command("min30", async (ctx) => {
        const { accounts, isFiltered, matchedName, error } = await resolveTargetAccounts(ctx, ctx.match);
        if (error) {
            return ctx.reply(error, { parse_mode: "HTML" });
        }

        const scopeLabel = isFiltered ? `<b>${matchedName}</b>` : "all connected projects";
        const loadingMessage = await ctx.reply(`Getting last 30 minutes active report for ${scopeLabel}...`, { parse_mode: "HTML" });

        try {
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

            finalMessage += `\n⏳ ${getFormattedDate()}`;

            let replyMarkup = undefined;
            if (successfulCount > 0) {
                const reportId = await saveReportContext(ctx.env, 'min30', results, { isFiltered, projectName: matchedName });
                replyMarkup = new InlineKeyboard().text("📈 View as Chart", `chart:${reportId}`);
            }

            await ctx.reply(finalMessage, { parse_mode: 'HTML', reply_markup: replyMarkup });
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
