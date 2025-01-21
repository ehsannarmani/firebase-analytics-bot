const { getActiveUsersLast30Minutes, getLifetimeActiveUsers, getDailyActiveUsers } = require('./analytics');
const { getFormattedDate, getMonthName } = require('./dateUtils');

const LAST_30_MIN_INTERVAL = 15 * 60 * 1000; // 15 minutes
const DAILY_ACTIVE_USERS_INTERVAL = 4 * 60 * 60 * 1000; // 4 hours

function startSchedulers(bot) {
    setInterval(async () => {
        try {
            const report = await getActiveUsersLast30Minutes();
            await bot.api.sendMessage(process.env.UPDATE_CHANNEL_ID, `📍 Active users in last 30 minutes: <code>${report}</code>\n\n⏳ ${getFormattedDate()}`, { parse_mode: 'HTML' });
        } catch (e) {
            console.log(e);
        }
    }, LAST_30_MIN_INTERVAL);

    setInterval(async () => {
        try {
            const totalUsers = await getLifetimeActiveUsers();
            const report = (await getDailyActiveUsers()).reverse();
            const today = report[0];
            let splitDate = today.date.split("-");
            const day = splitDate[2];
            const month = splitDate[1];
            const monthName = getMonthName(month);
            let msg = `📍 Today(${day} ${monthName}) active users: <code>${today.users}</code>`;
            if (today.grow) {
                if (today.grow < 0) {
                    msg += `\n😓 Unfortunately, we fell <code>${today.grow}%</code> from the previous day.`;
                } else {
                    msg += `\n🎉 Congratulations! we grew <code>${today.grow}%</code> from yesterday.`;
                }
            }
            msg += `\n\n🙌 We reached to total: <code>${totalUsers}</code> users.`;
            const message = await bot.api.sendMessage(process.env.UPDATE_CHANNEL_ID, `${msg}\n\n⏳ ${getFormattedDate()}`, { parse_mode: 'HTML' });
            try {
                await bot.api.pinChatMessage(process.env.UPDATE_CHANNEL_ID, message.message_id);
            } catch (e) {
                await bot.api.unpinAllChatMessages(process.env.UPDATE_CHANNEL_ID);
                await bot.api.pinChatMessage(process.env.UPDATE_CHANNEL_ID, message.message_id);
            }
        } catch (e) {
            console.log(e);
        }
    }, DAILY_ACTIVE_USERS_INTERVAL);
}

module.exports = { startSchedulers };
