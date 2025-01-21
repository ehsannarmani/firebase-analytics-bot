const { getActiveUsersLast30Minutes } = require('../services/analytics');
const { getFormattedDate } = require('../services/dateUtils');

const liveUpdates = new Set();

function setupLiveCommand(bot) {
    bot.command("live", async (ctx) => {
        const message = await ctx.reply("Starting live update for last 30 minutes active users...");
        const update = async () => {
            try {
                const report = await getActiveUsersLast30Minutes();
                await bot.api.editMessageText(
                    message.chat.id,
                    message.message_id,
                    `🛜 Live Update\n\n📍 Active users in last 30 minutes: <code>${report}</code>\n\nLast Update: ${getFormattedDate()}`,
                    { parse_mode: 'HTML' }
                );
            } catch (e) { }
        };
        await update();
        const intervalId = setInterval(update, 5000);
        liveUpdates.add({
            messageId: message.message_id,
            intervalId: intervalId
        });
    });
}

module.exports = { setupLiveCommand, liveUpdates };
