import { getDailyActiveUsers } from '../services/analytics.js';

export function setupNewUsersCommand(bot) {
    bot.command("new_users", async (ctx) => {
        const loadingMessage = await ctx.reply("Getting new users report...");
        try {
            const report = (await getDailyActiveUsers('newUsers', ctx.env)).reverse();
            const msg = report
                .map(dayReport => {
                    let result = `📍 <code>${dayReport.date}</code> 👉 <code>${dayReport.users}</code> New users`;
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
            await ctx.reply(`👥 Daily new users: \n\n${msg}`, { parse_mode: 'HTML' });
        } catch (error) {
            console.error('Error fetching new users report:', error);
            await ctx.reply("❌ Failed to fetch new users report. Please try again later.");
        } finally {
            await ctx.deleteMessages([loadingMessage.message_id]);
        }
    });
}
