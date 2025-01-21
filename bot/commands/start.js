
function setupStartCommand(bot) {
    bot.command("start", async (ctx) => {
        await ctx.reply("🙌 Welcome to analytics bot\n\n/daily - Get daily active users report\n/min30 - Get last 30 minutes active users\n/users - Get total lifetime users\n/countries - Get total lifetime users by countries");
    });
}

module.exports = { setupStartCommand };
