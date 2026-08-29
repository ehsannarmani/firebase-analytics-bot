import { InlineKeyboard } from "grammy";
import {
    getActiveUsersLast30Minutes,
    getLifetimeActiveUsers,
    getDailyActiveUsers,
    getAccountsForExecution,
    runMultiAccountExecution
} from './analytics.js';
import { getFormattedDate, getMonthName } from './dateUtils.js';
import { SettingsRepository } from '../db/settingsRepository.js';
import { saveReportContext } from './reportCache.js';

const LAST_30_MIN_INTERVAL = 15 * 60 * 1000; // 15 minutes
const DAILY_ACTIVE_USERS_INTERVAL = 4 * 60 * 60 * 1000; // 4 hours

export async function sendMin30Update(bot, env) {
    const settingsRepo = new SettingsRepository(env);
    const { channelId } = await settingsRepo.getUpdateChannelId(env);

    if (!channelId) {
        console.error("Update Channel ID is not configured (neither in database nor environment).");
        return;
    }

    try {
        const accounts = await getAccountsForExecution(env);
        if (!accounts || accounts.length === 0) {
            console.log("No enabled Firebase accounts found for min30 update.");
            return;
        }

        const results = await runMultiAccountExecution(accounts, async (account) => {
            return await getActiveUsersLast30Minutes(account);
        });

        let msg = `📍 <b>Active users in last 30 minutes:</b>\n`;
        let totalActiveUsers = 0;
        let successfulCount = 0;

        for (const res of results) {
            msg += `\n━━━━━━━━━━━━━━━━━━\n`;
            msg += `🔥 <b>${res.account.name}</b>\n`;
            if (res.success) {
                msg += `Active users: <code>${res.data}</code>\n`;
                totalActiveUsers += Number(res.data) || 0;
                successfulCount++;
            } else {
                msg += `❌ <i>Failed to retrieve statistics</i>\n`;
            }
        }

        if (results.length > 1 && successfulCount > 0) {
            msg += `\n━━━━━━━━━━━━━━━━━━\n`;
            msg += `📈 <b>Total Active Users:</b> <code>${totalActiveUsers}</code>\n`;
        }

        msg += `\n⏳ ${getFormattedDate()}`;

        let replyMarkup = undefined;
        if (successfulCount > 0) {
            const reportId = await saveReportContext(env, 'min30', results, { isFiltered: false });
            replyMarkup = new InlineKeyboard().text("📈 View as Chart", `chart:${reportId}`);
        }

        await bot.api.sendMessage(channelId, msg, { parse_mode: 'HTML', reply_markup: replyMarkup });

        // Proactive Traffic Anomaly & Spike/Drop detection
        try {
            const { checkTrafficAnomalies } = await import('./anomalyService.js');
            await checkTrafficAnomalies(bot, env);
        } catch (anomErr) {
            console.error("Error in checkTrafficAnomalies:", anomErr.message);
        }
    } catch (e) {
        console.error("Error in min30 scheduler:", e);
    }
}

export async function sendDailyUpdate(bot, env) {
    const settingsRepo = new SettingsRepository(env);
    const { channelId } = await settingsRepo.getUpdateChannelId(env);

    if (!channelId) {
        console.error("Update Channel ID is not configured (neither in database nor environment).");
        return;
    }

    try {
        const accounts = await getAccountsForExecution(env);
        if (!accounts || accounts.length === 0) {
            console.log("No enabled Firebase accounts found for daily update.");
            return;
        }

        // Retrieve both summary and full 7-day daily data for chart
        const results = await runMultiAccountExecution(accounts, async (account) => {
            const lifetime = await getLifetimeActiveUsers(account);
            const daily = (await getDailyActiveUsers('activeUsers', account)).reverse();
            return {
                lifetime,
                today: daily && daily.length > 0 ? daily[0] : null,
                dailyList: (daily || []).reverse(), // asc for chart
            };
        });

        let msg = `📊 <b>Daily Analytics Report</b>\n`;
        let totalTodayUsers = 0;
        let totalLifetimeUsers = 0;
        let successfulCount = 0;

        for (const res of results) {
            msg += `\n━━━━━━━━━━━━━━━━━━\n`;
            msg += `🔥 <b>${res.account.name}</b>\n`;

            if (res.success && res.data) {
                successfulCount++;
                const { today, lifetime } = res.data;
                totalLifetimeUsers += Number(lifetime) || 0;

                if (today) {
                    let splitDate = today.date.split("-");
                    const day = splitDate[2];
                    const month = splitDate[1];
                    const monthName = getMonthName(month);
                    const userCount = Number(today.users) || 0;
                    totalTodayUsers += userCount;

                    msg += `👥 Today (${day} ${monthName}) active: <code>${today.users}</code>\n`;

                    if (today.grow) {
                        if (today.grow < 0) {
                            msg += `😓 Fell <code>${today.grow}%</code> from previous day\n`;
                        } else {
                            msg += `🎉 Grew <code>${today.grow}%</code> from yesterday\n`;
                        }
                    }
                }

                msg += `🙌 Lifetime Users: <code>${lifetime}</code>\n`;
            } else {
                msg += `❌ <i>Failed to retrieve statistics</i>\n`;
            }
        }

        if (results.length > 1 && successfulCount > 0) {
            msg += `\n━━━━━━━━━━━━━━━━━━\n`;
            msg += `📈 <b>Combined Total:</b>\n`;
            msg += `👥 Today Active: <code>${totalTodayUsers}</code>\n`;
            msg += `🙌 Lifetime Users: <code>${totalLifetimeUsers}</code>\n`;
        }

        msg += `\n⏳ ${getFormattedDate()}`;

        let replyMarkup = undefined;
        if (successfulCount > 0) {
            // Transform results to standard daily chart structure
            const chartData = results.map(r => ({
                account: r.account,
                success: r.success,
                data: r.data?.dailyList || [],
            }));
            const reportId = await saveReportContext(env, 'daily', chartData, { isFiltered: false });
            replyMarkup = new InlineKeyboard().text("📈 View as Chart", `chart:${reportId}`);
        }

        const message = await bot.api.sendMessage(channelId, msg, { parse_mode: 'HTML', reply_markup: replyMarkup });
        try {
            await bot.api.pinChatMessage(channelId, message.message_id);
        } catch (e) {
            try {
                await bot.api.unpinAllChatMessages(channelId);
                await bot.api.pinChatMessage(channelId, message.message_id);
            } catch (err) {
                // Ignore pin failure if permissions not granted
            }
        }
    } catch (e) {
        console.error("Error in daily scheduler:", e);
    }
}

export function startSchedulers(bot, env) {
    if (typeof setInterval !== 'undefined') {
        setInterval(() => sendMin30Update(bot, env), LAST_30_MIN_INTERVAL);
        setInterval(() => sendDailyUpdate(bot, env), DAILY_ACTIVE_USERS_INTERVAL);
    }
}
