import { getActiveUsersLast30Minutes } from '../services/analytics.js';
import { getFormattedDate } from '../services/dateUtils.js';

export const subscribedMessages = new Set();
let updateInterval = null;

export function setupLiveCommand(bot) {
    bot.command("live", async (ctx) => {
        try {
            const result = await getActiveUsersLast30Minutes(ctx.env);
            const message = await ctx.reply(`🛜 Live Update\n\n📍 Active users in last 30 minutes: <code>${result}</code>\n\nLast Update: ${getFormattedDate()}`, { parse_mode: 'HTML' });
            
            // In Node.js environment, enable periodic interval updating
            if (typeof process !== 'undefined' && process.release?.name === 'node') {
                if (subscribedMessages.size === 0) {
                    startUpdate(bot, 60, ctx.env);
                }
                subscribedMessages.add({ messageId: message.message_id, chatId: message.chat.id });
            }
        } catch (e) {
            console.error("Error in live command:", e);
            await ctx.reply("❌ Failed to fetch live analytics data.");
        }
    });
}

function startUpdate(bot, duration, env) {
    if (updateInterval) clearInterval(updateInterval);
    updateInterval = setInterval(async function () {
        try {
            const result = await getActiveUsersLast30Minutes(env);
            for (const message of subscribedMessages) {
                await bot.api.editMessageText(
                    message.chatId,
                    message.messageId,
                    `🛜 Live Update\n\n📍 Active users in last 30 minutes: <code>${result}</code>\n\nLast Update: ${getFormattedDate()}`,
                    { parse_mode: 'HTML' }
                );
            }
        } catch (e) {
            console.error("Error updating live messages:", e);
        }
    }, duration * 1000);
}

export function stopLive() {
    if (updateInterval) {
        clearInterval(updateInterval);
        updateInterval = null;
    }
}
