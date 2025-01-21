const { getLifetimeUsersByCountry } = require('../services/analytics');
const { formatLifetimeUsersByCountry } = require('../services/dateUtils');

function setupCountriesCommand(bot) {
    bot.command("countries", async (ctx) => {
        const requestedCountries = ctx.match.split(" ").filter(item=> item !== "")
        const loadingMessage = await ctx.reply("Getting total lifetime users by country...");
        try {
            const lifetimeUsersByCountry = await getLifetimeUsersByCountry();
            const formattedMessage = formatLifetimeUsersByCountry(lifetimeUsersByCountry,requestedCountries);
            await ctx.reply(`🌍 Total Lifetime Users by Country:\n\n${formattedMessage}`, {
                parse_mode: 'HTML',
            });
        } catch (error) {
            console.error('Error fetching lifetime users by country:', error);
            await ctx.reply("❌ Failed to fetch lifetime users by country. Please try again later.");
        }
        await ctx.deleteMessages([loadingMessage.message_id]);
    });
}

module.exports = { setupCountriesCommand };
