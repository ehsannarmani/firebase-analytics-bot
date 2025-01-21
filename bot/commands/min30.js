const { getActiveUsersLast30Minutes } = require('../services/analytics');

function setupMin30Command(bot) {
    bot.command("min30", async (ctx) => {
        const loadingMessage = await ctx.reply("Getting last 30 minutes active report...");
        try {
            const report = await getActiveUsersLast30Minutes();
            await ctx.reply(`📍 Active users in last 30 minutes: <code>${report}</code>`, { parse_mode: 'HTML' });
        } catch (e) {
            console.error('Error fetching last 30 minutes active users:', e);
            await ctx.reply("❌ Failed to fetch last 30 minutes active users. Please try again later.");
        }
        await ctx.deleteMessages([loadingMessage.message_id]);
    });
}

module.exports = { setupMin30Command };
