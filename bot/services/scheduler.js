import { getActiveUsersLast30Minutes, getLifetimeActiveUsers, getDailyActiveUsers } from './analytics.js';
import { getFormattedDate, getMonthName } from './dateUtils.js';

const LAST_30_MIN_INTERVAL = 15 * 60 * 1000; // 15 minutes
const DAILY_ACTIVE_USERS_INTERVAL = 4 * 60 * 60 * 1000; // 4 hours

export async function sendMin30Update(bot, env) {
    const channelId = env?.UPDATE_CHANNEL_ID || (typeof process !== 'undefined' ? process.env?.UPDATE_CHANNEL_ID : undefined);
    if (!channelId) {
        console.error("UPDATE_CHANNEL_ID is not configured.");
        return;
    }
    try {
        const report = await getActiveUsersLast30Minutes(env);
        await bot.api.sendMessage(channelId, `📍 Active users in last 30 minutes: <code>${report}</code>\n\n⏳ ${getFormattedDate()}`, { parse_mode: 'HTML' });
    } catch (e) {
        console.error("Error in min30 scheduler:", e);
    }
}

export async function sendDailyUpdate(bot, env) {
    const channelId = env?.UPDATE_CHANNEL_ID || (typeof process !== 'undefined' ? process.env?.UPDATE_CHANNEL_ID : undefined);
    if (!channelId) {
        console.error("UPDATE_CHANNEL_ID is not configured.");
        return;
    }
    try {
        const totalUsers = await getLifetimeActiveUsers(env);
        const report = (await getDailyActiveUsers('activeUsers', env)).reverse();
        if (!report || report.length === 0) return;
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
        const message = await bot.api.sendMessage(channelId, `${msg}\n\n⏳ ${getFormattedDate()}`, { parse_mode: 'HTML' });
        try {
            await bot.api.pinChatMessage(channelId, message.message_id);
        } catch (e) {
            await bot.api.unpinAllChatMessages(channelId);
            await bot.api.pinChatMessage(channelId, message.message_id);
        }
    } catch (e) {
        console.error("Error in daily scheduler:", e);
    }
}

export function startSchedulers(bot, env) {
    setInterval(() => {
        sendMin30Update(bot, env);
    }, LAST_30_MIN_INTERVAL);

    setInterval(() => {
        sendDailyUpdate(bot, env);
    }, DAILY_ACTIVE_USERS_INTERVAL);
}
