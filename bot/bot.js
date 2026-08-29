import { Bot } from "grammy";
import dotenv from "dotenv";

import { setupDailyCommand } from './commands/daily.js';
import { setupMin30Command } from './commands/min30.js';
import { setupLiveCommand } from './commands/live.js';
import { setupStopCommand } from './commands/stop.js';
import { setupUsersCommand } from './commands/users.js';
import { setupCountriesCommand } from './commands/countries.js';
import { authMiddleware } from './middleware/auth.js';
import { startSchedulers } from './services/scheduler.js';
import { setupStartCommand } from "./commands/start.js";
import { setupHelpCommand } from "./commands/help.js";
import { configureCommands } from "./commands/configure.js";
import { setupNewUsersCommand } from "./commands/newUsers.js";
import { setupVersionsCommand } from "./commands/versions.js";
import { setupEngagementCommand } from "./commands/engagement.js";
import { setupEventsCommand } from "./commands/events.js";

dotenv.config();

export function createBot(token, env) {
    const botToken = token || env?.BOT_TOKEN || (typeof process !== 'undefined' ? process.env?.BOT_TOKEN : undefined);
    const bot = new Bot(botToken);

    bot.use(async (ctx, next) => {
        ctx.env = env || (typeof process !== 'undefined' ? process.env : {});
        await next();
    });

    configureCommands(bot);
    bot.use(authMiddleware);

    setupStartCommand(bot);
    setupHelpCommand(bot);
    setupDailyCommand(bot);
    setupNewUsersCommand(bot);
    setupVersionsCommand(bot);
    setupMin30Command(bot);
    setupLiveCommand(bot);
    setupStopCommand(bot);
    setupUsersCommand(bot);
    setupCountriesCommand(bot);
    setupEngagementCommand(bot);
    setupEventsCommand(bot);

    return bot;
}

if (typeof process !== 'undefined' && process.argv && process.argv[1] && (process.argv[1].endsWith('bot.js') || process.argv[1].endsWith('bot\\bot.js'))) {
    const botToken = process.env.BOT_TOKEN;
    if (!botToken) {
        console.error("BOT_TOKEN environment variable is required.");
        process.exit(1);
    }
    const bot = createBot(botToken, process.env);
    bot.start();
    console.log("Bot is running in long-polling mode (Node.js)...");
    startSchedulers(bot, process.env);
}
