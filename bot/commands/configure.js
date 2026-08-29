export const commands = [
    { command: 'start', description: 'Start the bot and view quick summary.' },
    { command: 'help', description: 'Detailed guide and usage instructions for all commands.' },
    { command: 'dashboard', description: 'Executive multi-project overview & global KPIs.' },
    { command: 'projects', description: 'List or inspect Firebase projects and platforms.' },
    { command: 'compare', description: 'Compare metrics with previous period (e.g. /compare 14d).' },
    { command: 'daily', description: 'Daily active users report (e.g. /daily 30d, /daily zino).' },
    { command: 'new_users', description: 'Daily new users report (e.g. /new_users 30d).' },
    { command: 'min30', description: 'Active users in last 30 minutes (supports optional [project]).' },
    { command: 'users', description: 'Total lifetime active users (supports optional [project]).' },
    { command: 'countries', description: 'Lifetime users by country (supports [project] and filter).' },
    { command: 'versions', description: 'Active users by app version (supports optional [project]).' },
    { command: 'engagement', description: 'Average engagement time (supports optional [project]).' },
    { command: 'events', description: 'Event analytics & drill-down (supports optional [project]).' },
    { command: 'admin', description: 'Open Admin Control Panel (accounts, access, channel).' },
    { command: 'live', description: 'Live active users updates (supports optional [project]).' },
    { command: 'stop', description: 'Stop live updates by replying to a live message.' },
    { command: 'migrate', description: 'Migrate legacy environment variables to database.' },
    { command: 'cancel', description: 'Cancel current admin operation.' },
];

export async function configureCommands(bot) {
    try {
        await bot.api.setMyCommands(commands);
    } catch (e) {
        console.log(`Unable to configure commands: ${e}`);
    }
}
