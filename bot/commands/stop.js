const { liveUpdates } = require('./live');

function setupStopCommand(bot) {
    bot.command("stop", async (ctx) => {
        try {
            if (ctx.message.reply_to_message) {
                const repliedMessageId = ctx.message.reply_to_message.message_id;
                const foundLiveUpdate = Array.from(liveUpdates).filter((value) => value.messageId == repliedMessageId)[0];
                if (foundLiveUpdate) {
                    clearInterval(foundLiveUpdate.intervalId);
                    let liveUpdateText = ctx.message.reply_to_message.text;

                    liveUpdateText = liveUpdateText.split("Live Update");
                    const newText = `${liveUpdateText[0]} Live Update - Stopped ❌${liveUpdateText[1]}`;
                    await bot.api.editMessageText(ctx.chat.id, repliedMessageId, newText, { parse_mode: 'HTML' });
                    await ctx.reply("Replied live update stopped. ✅");
                    liveUpdates.delete(foundLiveUpdate);
                } else {
                    await ctx.reply("❌ Live update is not found, maybe it's stopped or something.");
                }
            } else {
                await ctx.reply("❌ You can reply this command on live update analytics to stop it.");
            }
        } catch (e) { }
    });
}

module.exports = { setupStopCommand };
