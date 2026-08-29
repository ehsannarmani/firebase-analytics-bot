import { getActiveUsersLast30Minutes, runMultiAccountExecution } from '../services/analytics.js';
import { getFormattedDate } from '../services/dateUtils.js';
import { resolveTargetAccounts } from '../services/projectResolver.js';

export const subscribedMessages = new Set();
let updateInterval = null;

async function generateLiveReportText(env, targetAccounts = null) {
    const accounts = targetAccounts || await getAccountsForExecution(env);
    if (!accounts || accounts.length === 0) {
        return "📭 No enabled Firebase accounts found.";
    }

    const results = await runMultiAccountExecution(accounts, async (account) => {
        return await getActiveUsersLast30Minutes(account);
    });

    let msg = `🛜 <b>Live Active Users Update (Last 30 Min)</b>\n`;
    let total = 0;
    let successfulCount = 0;

    for (const res of results) {
        msg += `\n━━━━━━━━━━━━━━━━━━\n`;
        msg += `🔥 <b>${res.account.name}</b>\n`;
        if (res.success) {
            msg += `Active users: <code>${res.data}</code>\n`;
            total += Number(res.data) || 0;
            successfulCount++;
        } else {
            msg += `❌ <i>Failed to retrieve statistics</i>\n`;
        }
    }

    if (results.length > 1 && successfulCount > 0) {
        msg += `\n━━━━━━━━━━━━━━━━━━\n`;
        msg += `📈 <b>Total Active Users:</b> <code>${total}</code>\n`;
    }

    msg += `\n⏳ Last Update: ${getFormattedDate()}`;
    return msg;
}

export function setupLiveCommand(bot) {
    bot.command("live", async (ctx) => {
        const { accounts, isFiltered, matchedName, error } = await resolveTargetAccounts(ctx, ctx.match);
        if (error) {
            return ctx.reply(error, { parse_mode: "HTML" });
        }

        try {
            const reportText = await generateLiveReportText(ctx.env, accounts);
            const message = await ctx.reply(reportText, { parse_mode: 'HTML' });

            // In Node.js environment, enable periodic interval updating
            if (typeof process !== 'undefined' && process.release?.name === 'node') {
                if (subscribedMessages.size === 0) {
                    startUpdate(bot, 60, ctx.env, accounts);
                }
                subscribedMessages.add({ messageId: message.message_id, chatId: message.chat.id, accounts });
            }
        } catch (e) {
            console.error("Error in live command:", e);
            await ctx.reply("❌ Failed to fetch live analytics data.");
        }
    });
}

function startUpdate(bot, duration, env, accounts) {
    if (updateInterval) clearInterval(updateInterval);
    updateInterval = setInterval(async function () {
        try {
            for (const item of subscribedMessages) {
                const reportText = await generateLiveReportText(env, item.accounts);
                await bot.api.editMessageText(
                    item.chatId,
                    item.messageId,
                    reportText,
                    { parse_mode: 'HTML' }
                );
            }
        } catch (e) {
            console.error("Error updating live messages:", e);
        }
    }, duration * 1000);
}

export function stopLive() {
    if (updateInterval) {
        clearInterval(updateInterval);
        updateInterval = null;
    }
}
