const {commands} = require("./configure");

function setupStartCommand(bot) {
    bot.command("start", async (ctx) => {
        const commandsText = commands.map(command=>`/${command.command} - ${command.description}`).join("\n")
        await ctx.reply("🙌 Welcome to analytics bot\n\n"+ commandsText);
    });
}

module.exports = { setupStartCommand };
