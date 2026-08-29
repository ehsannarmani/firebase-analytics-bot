import { subscribedMessages, stopLive } from "./live.js";

export function setupStopCommand(bot) {
    bot.command("stop", async (ctx) => {
        try {
            if (ctx.message && ctx.message.reply_to_message) {
                const repliedMessageId = ctx.message.reply_to_message.message_id;
                const subscribedMessage = Array.from(subscribedMessages).find((value) => value.messageId == repliedMessageId);
                if (subscribedMessage) {
                    subscribedMessages.delete(subscribedMessage);
                    let liveUpdateText = ctx.message.reply_to_message.text || "";

                    const parts = liveUpdateText.split("Live Update");
                    const newText = `${parts[0]} Live Update - Stopped ❌${parts[1] || ""}`;
                    await bot.api.editMessageText(ctx.chat.id, repliedMessageId, newText, { parse_mode: 'HTML' });
                    await ctx.reply("Replied live update stopped. ✅");
                    if (subscribedMessages.size === 0) stopLive();
                } else {
                    await ctx.reply("❌ Live update is not found, maybe it's stopped or something.");
                }
            } else {
                await ctx.reply("❌ You can reply this command on live update analytics to stop it.");
            }
        } catch (e) {
            console.error("Error in stop command:", e);
        }
    });
}
