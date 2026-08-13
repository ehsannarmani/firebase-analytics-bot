import { getDailyActiveUsersPerAppVersion } from '../services/analytics.js';

export function setupVersionsCommand(bot) {
    bot.command("versions", async (ctx) => {
        const loadingMessage = await ctx.reply("Getting active users by app version...");
        try {
            const report = await getDailyActiveUsersPerAppVersion('activeUsers', 'appVersion', ctx.env);
            const msg = report
                .map(dayReport => {
                    return `📍 <code>${dayReport.version}</code> 👉 <code>${dayReport.users}</code> active users`;
                })
                .join("\n");
            await ctx.reply(`👥 Active users by app versions: \n\n${msg}`, { parse_mode: 'HTML' });
        } catch (error) {
            console.error('Error fetching active users by app versions:', error);
            await ctx.reply("❌ Failed to fetch active users by app versions. Please try again later.");
        } finally {
            await ctx.deleteMessages([loadingMessage.message_id]);
        }
    });
}
