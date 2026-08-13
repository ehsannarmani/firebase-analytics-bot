import { getLifetimeUsersByCountry } from '../services/analytics.js';
import { formatLifetimeUsersByCountry } from '../services/dateUtils.js';

export function setupCountriesCommand(bot) {
    bot.command("countries", async (ctx) => {
        const matchText = ctx.match || "";
        const requestedCountries = matchText.split(" ").filter(item => item !== "");
        const loadingMessage = await ctx.reply("Getting total lifetime users by country...");
        try {
            const lifetimeUsersByCountry = await getLifetimeUsersByCountry(ctx.env);
            const formattedMessage = formatLifetimeUsersByCountry(lifetimeUsersByCountry, requestedCountries);
            await ctx.reply(`🌍 Total Lifetime Users by Country:\n\n${formattedMessage}`, {
                parse_mode: 'HTML',
            });
        } catch (error) {
            console.error('Error fetching lifetime users by country:', error);
            await ctx.reply("❌ Failed to fetch lifetime users by country. Please try again later.");
        } finally {
            await ctx.deleteMessages([loadingMessage.message_id]);
        }
    });
}
