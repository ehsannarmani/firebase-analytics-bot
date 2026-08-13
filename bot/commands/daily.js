import { getDailyActiveUsers } from '../services/analytics.js';

export function setupDailyCommand(bot) {
    bot.command("daily", async (ctx) => {
        const loadingMessage = await ctx.reply("Getting daily report...");
        try {
            const report = (await getDailyActiveUsers('activeUsers', ctx.env)).reverse();
            const msg = report
                .map(dayReport => {
                    let result = `📍 <code>${dayReport.date}</code> 👉 <code>${dayReport.users}</code> Active users`;
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
            await ctx.reply(`👥 Daily active users: \n\n${msg}`, { parse_mode: 'HTML' });
        } catch (error) {
            console.error('Error fetching daily active users:', error);
            await ctx.reply("❌ Failed to fetch daily active users. Please try again later.");
        } finally {
            await ctx.deleteMessages([loadingMessage.message_id]);
        }
    });
}
