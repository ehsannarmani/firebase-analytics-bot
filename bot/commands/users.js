import { InlineKeyboard } from "grammy";
import { getLifetimeActiveUsers, runMultiAccountExecution } from '../services/analytics.js';
import { resolveTargetAccounts } from '../services/projectResolver.js';
import { saveReportContext } from '../services/reportCache.js';

export function setupUsersCommand(bot) {
    bot.command("users", async (ctx) => {
        const { accounts, isFiltered, matchedName, error } = await resolveTargetAccounts(ctx, ctx.match);
        if (error) {
            return ctx.reply(error, { parse_mode: "HTML" });
        }

        const scopeLabel = isFiltered ? `<b>${matchedName}</b>` : "all connected projects";
        const loadingMessage = await ctx.reply(`Getting total lifetime users for ${scopeLabel}...`, { parse_mode: "HTML" });

        try {
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

            let replyMarkup = undefined;
            if (successfulCount > 0) {
                const reportId = await saveReportContext(ctx.env, 'users', results, { isFiltered, projectName: matchedName });
                replyMarkup = new InlineKeyboard().text("📈 View as Chart", `chart:${reportId}`);
            }

            await ctx.reply(finalMessage, { parse_mode: 'HTML', reply_markup: replyMarkup });
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
