export const commands = [
    { command: 'start', description: 'Start the bot and view quick summary.' },
    { command: 'help', description: 'Detailed guide and usage instructions for all commands.' },
    { command: 'daily', description: 'Active users report over the last 7 days with growth %.' },
    { command: 'min30', description: 'Active users in the last 30 minutes.' },
    { command: 'users', description: 'Total lifetime active users count.' },
    { command: 'new_users', description: 'New users report over the last 7 days.' },
    { command: 'countries', description: 'Lifetime users grouped by country (supports filtering).' },
    { command: 'versions', description: 'Active users over the last 7 days grouped by app version.' },
    { command: 'engagement', description: 'Average engagement time over the last 7 days.' },
    { command: 'events', description: 'Event analytics with parameter breakdown.' },
    { command: 'live', description: 'Start live update for active users in the last 30 minutes.' },
    { command: 'stop', description: 'Stop live updates by replying to a live message.' },
];

export async function configureCommands(bot) {
    try {
        await bot.api.setMyCommands(commands);
    } catch (e) {
        console.log(`Unable to configure commands: ${e}`);
    }
}
