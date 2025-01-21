const commands = [
    { command: 'start', description: 'Start the bot and view available commands.' },
    { command: 'daily', description: 'Get a report of active users over the last 7 days.' },
    { command: 'min30', description: 'Get the number of active users in the last 30 minutes.' },
    { command: 'users', description: 'Get the total number of lifetime users.' },
    { command: 'countries', description: 'Get the total lifetime users grouped by country.' },
    { command: 'live', description: 'Start live updates for active users in the last 30 minutes (updates every 5 seconds).' },
    { command: 'stop', description: 'Stop the live update by replying to the live update message.' },
];

function configureCommands(bot) {
    bot.api.setMyCommands(commands)
}

module.exports = {configureCommands, commands};
