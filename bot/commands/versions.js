const { getLifetimeUsersByCountry, getDailyActiveUsers, getDailyActiveUsersPerAppVersion} = require('../services/analytics');
const { formatLifetimeUsersByCountry } = require('../services/dateUtils');

function setupVersionsCommand(bot) {
    bot.command("versions", async (ctx) => {
        const loadingMessage = await ctx.reply("Getting active users by app version...");
        try {
            const report = await getDailyActiveUsersPerAppVersion('activeUsers','appVersion');
            const msg = report
                .map(dayReport => {
                    return `📍 <code>${dayReport.version}</code> 👉 <code>${dayReport.users}</code> active users`;
                })
                .join("\n");
            await ctx.deleteMessages([loadingMessage.message_id]);
            await ctx.reply(`👥 Active users by app versions: \n\n${msg}`, { parse_mode: 'HTML' });
        } catch (error) {
            console.error('Error fetching active users by app versions:', error);
            await ctx.reply("❌ Failed to fetch active users by app versions. Please try again later.");
        }
        await ctx.deleteMessages([loadingMessage.message_id]);
    });
}

module.exports = { setupVersionsCommand };
