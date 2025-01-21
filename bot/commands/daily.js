const { getDailyActiveUsers } = require('../services/analytics');
const { formatFirebaseDate } = require('../services/dateUtils');

function setupDailyCommand(bot) {
    bot.command("daily", async (ctx) => {
        const loadingMessage = await ctx.reply("Getting daily report...");
        const report = (await getDailyActiveUsers()).reverse();
        const msg = report
            .map(dayReport => {
                let result = `📍 <code>${dayReport.date}</code> 👉 <code>${dayReport.users}</code> Active users`;
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
        await ctx.reply(`👥 Daily active users: \n\n${msg}`, { parse_mode: 'HTML' });
    });
}

module.exports = { setupDailyCommand };
