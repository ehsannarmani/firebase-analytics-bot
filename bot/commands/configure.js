const commands = [
    { command: 'start', description: 'Start the bot and view available commands.' },
    { command: 'daily', description: 'Get a report of active users over the last 7 days.' },
    { command: 'min30', description: 'Get the number of active users in the last 30 minutes.' },
    { command: 'users', description: 'Get the total number of lifetime users.' },
    { command: 'new_users', description: 'Get a report of new users over the last 7 days.' },
    { command: 'countries', description: 'Get the total lifetime users grouped by country.' },
    { command: 'versions', description: 'Get a report of active users over the last 7 days grouped by app version.' },
    { command: 'live', description: 'Start live updates for active users in the last 30 minutes (updates every 5 seconds).' },
    { command: 'stop', description: 'Stop the live update by replying to the live update message.' },
];

async function configureCommands(bot) {
    try {
        await bot.api.setMyCommands(commands)
    }catch (e) {
        console.log(`Unable to configure commands: ${e}`)
    }
}

module.exports = {configureCommands, commands};
