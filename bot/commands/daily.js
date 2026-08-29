import { InlineKeyboard } from "grammy";
import { getDailyActiveUsers, runMultiAccountExecution } from '../services/analytics.js';
import { resolveTargetAccounts, normalizeSlug } from '../services/projectResolver.js';
import { saveReportContext } from '../services/reportCache.js';
import { FirebaseAccountRepository } from '../db/accountRepository.js';

export function setupDailyCommand(bot) {
    bot.command("daily", async (ctx) => {
        const rawTokens = (ctx.match || "").trim().split(/\s+/).filter(Boolean);

        let projectArg = "";
        let days = 7;

        // Parse tokens (e.g. /daily 30d, /daily zino 30d, /daily 14d zino)
        const repo = new FirebaseAccountRepository(ctx.env);
        let allAccounts = [];
        try {
            allAccounts = await repo.getAll();
        } catch (e) { }

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
        const loadingMessage = await ctx.reply(`Getting ${days}-day daily report for ${scopeLabel}...`, { parse_mode: "HTML" });

        try {
            const results = await runMultiAccountExecution(accounts, async (account) => {
                const list = await getDailyActiveUsers('activeUsers', account, days);
                return list.reverse();
            });

            let finalMessage = `👥 <b>Daily Active Users (Last ${days} Days)</b>\n`;
            let totalTodayUsers = 0;
            let successfulCount = 0;

            for (const res of results) {
                finalMessage += `\n━━━━━━━━━━━━━━━━━━\n`;
                finalMessage += `🔥 <b>${res.account.name}</b>\n\n`;

                if (res.success && res.data && res.data.length > 0) {
                    successfulCount++;
                    const report = res.data;
                    totalTodayUsers += Number(report[0]?.users) || 0;

                    // Display up to 10 latest days in message to keep clean
                    const displayList = report.slice(0, 10);
                    const msg = displayList
                        .map(dayReport => {
                            let result = `📍 <code>${dayReport.date}</code> 👉 <code>${dayReport.users.toLocaleString()}</code> Active users`;
                            if (dayReport.grow) {
                                if (dayReport.grow < 0) {
                                    result += ` 🔴`;
                                } else {
                                    result += ` 🟢`;
                                }
                                result += ` <code>${dayReport.grow}%</code>`;
                            }
                            return result;
                        })
                        .join("\n");

                    finalMessage += msg + "\n";
                    if (report.length > 10) {
                        finalMessage += `<i>...and ${report.length - 10} more days in chart below</i>\n`;
                    }
                } else if (res.success && (!res.data || res.data.length === 0)) {
                    finalMessage += `<i>No activity recorded in the last ${days} days.</i>\n`;
                } else {
                    finalMessage += `❌ <i>Failed to retrieve statistics</i>\n`;
                }
            }

            if (results.length > 1 && successfulCount > 0) {
                finalMessage += `\n━━━━━━━━━━━━━━━━━━\n`;
                finalMessage += `📈 <b>Combined Today Active Users:</b> <code>${totalTodayUsers.toLocaleString()}</code>\n`;
            }

            let replyMarkup = undefined;
            if (successfulCount > 0) {
                // Pass ascending data to chart builder
                const chartResults = results.map(r => ({
                    account: r.account,
                    success: r.success,
                    data: (r.data || []).slice().reverse(),
                }));
                const reportId = await saveReportContext(ctx.env, 'daily', chartResults, { isFiltered, projectName: matchedName, days });
                replyMarkup = new InlineKeyboard().text("📈 View as Chart", `chart:${reportId}`);
            }

            await ctx.reply(finalMessage, { parse_mode: 'HTML', reply_markup: replyMarkup });
        } catch (error) {
            console.error('Error fetching daily active users:', error);
            await ctx.reply("❌ Failed to fetch daily active users. Please try again later.");
        } finally {
            try {
                await ctx.deleteMessages([loadingMessage.message_id]);
            } catch (e) { }
        }
    });
}
