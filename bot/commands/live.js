const { getActiveUsersLast30Minutes } = require('../services/analytics');
const { getFormattedDate } = require('../services/dateUtils');

const subscribedMessages = new Set();
let updateInterval = null
function setupLiveCommand(bot) {
    bot.command("live", async (ctx) => {
        if(subscribedMessages.size === 0){
            startUpdate(bot,5)
        }
        const message = await ctx.reply("Starting live update for last 30 minutes active users...");
        subscribedMessages.add({messageId: message.message_id, chatId: message.chat.id})
    });
}

function startUpdate(bot,duration){
    updateInterval = setInterval(async function (){
        const result = await getActiveUsersLast30Minutes()
        for (const message of subscribedMessages) {
            await bot.api.editMessageText(
                message.chatId,
                message.messageId,
                `🛜 Live Update\n\n📍 Active users in last 30 minutes: <code>${result}</code>\n\nLast Update: ${getFormattedDate()}`,
                { parse_mode: 'HTML' }
            );
        }
    },duration*1000)
}
function stopLive(){
    clearInterval(updateInterval)
}

module.exports = { setupLiveCommand, stopLive, subscribedMessages };
