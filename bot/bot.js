const { Bot } = require("grammy");
require('dotenv').config();

const { setupDailyCommand } = require('./commands/daily');
const { setupMin30Command } = require('./commands/min30');
const { setupLiveCommand } = require('./commands/live');
const { setupStopCommand } = require('./commands/stop');
const { setupUsersCommand } = require('./commands/users');
const { setupCountriesCommand } = require('./commands/countries');
const { authMiddleware } = require('./middleware/auth');
const { startSchedulers } = require('./services/scheduler');
const {setupStartCommand} = require("./commands/start");
const {configureCommands} = require("./commands/configure");

const bot = new Bot(process.env.BOT_TOKEN);


configureCommands(bot)

// Middleware
bot.use(authMiddleware);

// Commands
setupStartCommand(bot)
setupDailyCommand(bot);
setupMin30Command(bot);
setupLiveCommand(bot);
setupStopCommand(bot);
setupUsersCommand(bot);
setupCountriesCommand(bot);

// Start the bot
bot.start();
console.log("Bot is running...");

// Start schedulers
startSchedulers(bot);
