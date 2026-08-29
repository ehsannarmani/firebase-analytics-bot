import { commands } from "./configure.js";

export function setupStartCommand(bot) {
    bot.command("start", async (ctx) => {
        const commandsText = commands.map(command => `/${command.command} - ${command.description}`).join("\n");
        await ctx.reply("🙌 Welcome to analytics bot\n\n" + commandsText);
    });
}
