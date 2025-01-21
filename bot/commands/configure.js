const commands = [
    {command: 'start', description: 'Start the bot'},
    {command: 'daily', description: 'Get daily active users report'},
    {command: 'min30', description: 'Get last 30 minutes active users'},
    {command: 'users', description: 'Get total lifetime users'},
    {command: 'countries', description: 'Get total lifetime users by countries'},
]

function configureCommands(bot) {
    bot.api.setMyCommands(commands)
}

module.exports = {configureCommands, commands};
