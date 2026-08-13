import { getLifetimeActiveUsers } from '../services/analytics.js';

export function setupUsersCommand(bot) {
    bot.command("users", async (ctx) => {
        const loadingMessage = await ctx.reply("Getting total lifetime users...");
        try {
            const lifetimeActiveUsers = await getLifetimeActiveUsers(ctx.env);
            await ctx.reply(`👥 Total Lifetime Users: <code>${lifetimeActiveUsers}</code>`, {
                parse_mode: 'HTML',
            });
        } catch (error) {
            console.error('Error fetching lifetime active users:', error);
            await ctx.reply("❌ Failed to fetch lifetime active users. Please try again later.");
        } finally {
            await ctx.deleteMessages([loadingMessage.message_id]);
        }
    });
}
