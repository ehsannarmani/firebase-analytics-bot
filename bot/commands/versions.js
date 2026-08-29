import { InlineKeyboard } from "grammy";
import { getDailyActiveUsersPerAppVersion, runMultiAccountExecution } from '../services/analytics.js';
import { resolveTargetAccounts } from '../services/projectResolver.js';
import { saveReportContext } from '../services/reportCache.js';

export function setupVersionsCommand(bot) {
    bot.command("versions", async (ctx) => {
        const { accounts, isFiltered, matchedName, error } = await resolveTargetAccounts(ctx, ctx.match);
        if (error) {
            return ctx.reply(error, { parse_mode: "HTML" });
        }

        const scopeLabel = isFiltered ? `<b>${matchedName}</b>` : "all connected projects";
        const loadingMessage = await ctx.reply(`Getting active users by app version for ${scopeLabel}...`, { parse_mode: "HTML" });

        try {
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

            let replyMarkup = undefined;
            if (successfulCount > 0) {
                const reportId = await saveReportContext(ctx.env, 'versions', results, { isFiltered, projectName: matchedName });
                replyMarkup = new InlineKeyboard().text("📈 View as Chart", `chart:${reportId}`);
            }

            await ctx.reply(finalMessage, { parse_mode: 'HTML', reply_markup: replyMarkup });
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
