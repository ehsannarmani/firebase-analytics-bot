const { getDailyActiveUsers } = require('../services/analytics');
const { formatFirebaseDate } = require('../services/dateUtils');

function setupNewUsersCommand(bot) {
    bot.command("new_users", async (ctx) => {
        const loadingMessage = await ctx.reply("Getting new users report...");
        const report = (await getDailyActiveUsers('newUsers')).reverse();
        const msg = report
            .map(dayReport => {
                let result = `📍 <code>${dayReport.date}</code> 👉 <code>${dayReport.users}</code> New users`;
                if (dayReport.grow) {
                    if (dayReport.grow < 0) {
                        result += ` 🔴`;
                    } else {
                        result += ` 🟢`;
                    }
                    result += ` <code>${dayReport.grow}%</code>`;
                }
                return result;
            })
            .join("\n");
        await ctx.deleteMessages([loadingMessage.message_id]);
        await ctx.reply(`👥 Daily new users: \n\n${msg}`, { parse_mode: 'HTML' });
    });
}

module.exports = { setupNewUsersCommand };
