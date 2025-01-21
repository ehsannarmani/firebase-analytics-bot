const { getLifetimeActiveUsers } = require('../services/analytics');

function setupUsersCommand(bot) {
    bot.command("users", async (ctx) => {
        const loadingMessage = await ctx.reply("Getting total lifetime users...");
        try {
            const lifetimeActiveUsers = await getLifetimeActiveUsers();
            await ctx.reply(`👥 Total Lifetime Users: <code>${lifetimeActiveUsers}</code>`, {
                parse_mode: 'HTML',
            });
        } catch (error) {
            console.error('Error fetching lifetime active users:', error);
            await ctx.reply("❌ Failed to fetch lifetime active users. Please try again later.");
        }
        await ctx.deleteMessages([loadingMessage.message_id]);
    });
}

module.exports = { setupUsersCommand };
